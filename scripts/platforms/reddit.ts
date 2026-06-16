/**
 * Reddit Ads adapter — Reddit Ads API (v3).
 *
 * Auth: OAuth refresh token minted per pull:
 *   POST https://www.reddit.com/api/v1/access_token
 *     grant_type=refresh_token (HTTP Basic: client_id:secret)
 * Base URL: https://ads-api.reddit.com/api/v3/
 *
 * Pull shape (mirrors Meta/Snap — flat additive rows):
 *   1) Ad account meta  → name/currency/timezone.
 *   2) Ads (paginated)  → id, name, status, created_at, campaign/ad group ids.
 *   3) Campaigns + ad groups → human-readable names.
 *   4) Creatives        → thumbnails + copy where available.
 *   5) AD-level report  → spend/impressions/clicks/conversions/video quartiles.
 */
import { missingEnv, PlatformNotConfiguredError, type FetchOptions, type PlatformAdapter } from './types.js';
import type { AccountInfo, BaseMetrics, CreativeResponse, CreativeRow } from '../meta-creative-api/metaApi.js';

const REQUIRED_ENV = [
  'REDDIT_CLIENT_ID',
  'REDDIT_CLIENT_SECRET',
  'REDDIT_REFRESH_TOKEN',
  'REDDIT_AD_ACCOUNT_ID',
];

const AUTH_URL = 'https://www.reddit.com/api/v1/access_token';
const API = 'https://ads-api.reddit.com/api/v3';
const UA = process.env.REDDIT_USER_AGENT ?? 'creative-lab/1.0';

interface RedditCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  adAccountId: string;
}

function loadCredentials(): RedditCredentials {
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length) throw new PlatformNotConfiguredError('reddit', missing);
  return {
    clientId: process.env.REDDIT_CLIENT_ID!.trim(),
    clientSecret: process.env.REDDIT_CLIENT_SECRET!.trim(),
    refreshToken: process.env.REDDIT_REFRESH_TOKEN!.trim(),
    adAccountId: process.env.REDDIT_AD_ACCOUNT_ID!.trim(),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const micros = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n / 1e6 : 0;
};

function zeroMetrics(): BaseMetrics {
  return {
    spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, landingPageViews: 0,
    purchases: 0, purchaseValue: 0, registrations: 0, leads: 0, addToCart: 0,
    initiateCheckout: 0, postEngagement: 0, reactions: 0, comments: 0, shares: 0,
    saves: 0, videoPlays: 0, video3s: 0, thruplays: 0, videoWatchSeconds: 0,
    p25: 0, p50: 0, p75: 0, p100: 0,
  };
}

async function getAccessToken(c: RedditCredentials): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: c.refreshToken,
  });
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`,
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`Reddit auth failed: ${json.error ?? res.statusText}`);
  }
  return json.access_token;
}

interface RedditEnvelope {
  data?: unknown;
  pagination?: { next_url?: string | null };
  [k: string]: unknown;
}

/** One raw request against a full URL. Returns the parsed envelope (data + pagination). */
async function redditFetch(
  url: string,
  token: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
  attempt = 0,
): Promise<RedditEnvelope> {
  const method = init.method ?? 'GET';
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': UA,
      'Content-Type': 'application/json',
    },
    body: method === 'POST' && init.body ? JSON.stringify(init.body) : undefined,
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(1500 * 2 ** attempt);
    return redditFetch(url, token, init, attempt + 1);
  }
  const text = await res.text();
  let json: RedditEnvelope = {};
  try { json = text ? (JSON.parse(text) as RedditEnvelope) : {}; } catch { json = { _raw: text } as RedditEnvelope; }
  if (!res.ok) {
    const detail =
      typeof json.message === 'string' ? json.message
        : typeof json.error === 'string' ? json.error
          : JSON.stringify(json.error ?? json.message ?? json).slice(0, 200);
    throw new Error(`Reddit API error (${res.status}) ${url.replace(API, '')}: ${detail}`);
  }
  return json;
}

async function redditRequest<T>(path: string, token: string): Promise<T> {
  const json = await redditFetch(`${API}${path}`, token);
  return (json.data ?? json) as T;
}

function asRows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: T[] }).data;
  }
  return [];
}

/**
 * Cursor-paginated list (ads/campaigns/ad_groups). Reddit defaults to 50/page;
 * we request the max (`page.size=1000`) to slash round-trips (a 3k-ad account
 * goes from ~60 pages to ~3), keeping the warm fast enough to share Meta/Snap's
 * cron budget. Follow `pagination.next_url` (absolute, carries the cursor) until
 * exhausted — otherwise we only see the first page and drop most delivering ads.
 */
async function redditListAll<T>(path: string, token: string, maxPages = 200): Promise<T[]> {
  const out: T[] = [];
  const sep = path.includes('?') ? '&' : '?';
  let url: string | undefined = `${API}${path}${sep}page.size=1000`;
  for (let page = 0; page < maxPages && url; page++) {
    const json = await redditFetch(url, token);
    out.push(...asRows<T>(json.data));
    url = json.pagination?.next_url ?? undefined;
  }
  return out;
}

// ---- Date range (YYYY-MM-DD, account tz when available) ----

const PRESET_DAYS: Record<string, number> = { last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 };

function ymdInTz(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

function fmtYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function shiftYmd(y: number, m: number, d: number, days: number): string {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return fmtYmd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function resolveRange(opts: FetchOptions, timeZone: string): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const today = ymdInTz(now, timeZone);

  if (opts.since && opts.until) {
    return { startDate: opts.since, endDate: opts.until, label: `${opts.since} → ${opts.until}` };
  }

  const preset = opts.datePreset ?? 'last_14d';
  if (preset === 'this_month') {
    const start = fmtYmd(today.y, today.m, 1);
    const end = fmtYmd(today.y, today.m, today.d);
    return { startDate: start, endDate: end, label: 'This month' };
  }
  if (preset === 'last_month') {
    const firstThis = shiftYmd(today.y, today.m, 1, 0);
    const [ty, tm] = firstThis.split('-').map(Number);
    const lastDayPrev = shiftYmd(ty, tm, 1, -1);
    const [py, pm] = lastDayPrev.split('-').map(Number);
    const firstLast = fmtYmd(py, pm, 1);
    return { startDate: firstLast, endDate: lastDayPrev, label: 'Last month' };
  }

  const days = PRESET_DAYS[preset] ?? 14;
  const start = shiftYmd(today.y, today.m, today.d, -(days - 1));
  const end = fmtYmd(today.y, today.m, today.d);
  return {
    startDate: start,
    endDate: end,
    label: preset.replace('last_', 'Last ').replace('d', ' days'),
  };
}

// ---- Entity types (fields we read) ----

interface RedditAdAccount {
  id?: string;
  name?: string;
  currency?: string;
  time_zone_id?: string;
  timezone?: string;
}

interface RedditNamedEntity {
  id: string;
  name?: string;
}

interface RedditAd {
  id: string;
  name?: string;
  configured_status?: string;
  effective_status?: string;
  created_at?: string;
  campaign_id?: string;
  ad_group_id?: string;
  creative_id?: string;
  post_id?: string;
  post_url?: string;
  click_url?: string;
}

/** v3 report `fields` enums (UPPER_SNAKE). */
const REPORT_FIELDS_CORE = ['IMPRESSIONS', 'CLICKS', 'SPEND'];

const REPORT_FIELDS_EXTENDED = [
  ...REPORT_FIELDS_CORE,
  'CONVERSION_PURCHASE_CLICKS',
  'CONVERSION_PURCHASE_VIEWS',
  'VIDEO_STARTED',
  'VIDEO_WATCHED_25_PERCENT',
  'VIDEO_WATCHED_50_PERCENT',
  'VIDEO_WATCHED_75_PERCENT',
  'VIDEO_WATCHED_100_PERCENT',
];

function normalizeReportRows(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const key of ['rows', 'metrics', 'data', 'results']) {
      if (Array.isArray(d[key])) return d[key] as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function reportAdId(row: Record<string, unknown>): string | null {
  const direct = row.ad_id ?? row.AD_ID ?? row.id;
  if (typeof direct === 'string' && direct) return direct;
  const breakdowns = row.breakdowns;
  if (breakdowns && typeof breakdowns === 'object') {
    const b = breakdowns as Record<string, unknown>;
    const id = b.ad_id ?? b.AD_ID;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

function parseSpend(row: Record<string, unknown>): number {
  const micro = pick(row, 'spend_micro', 'SPEND_MICRO');
  if (micro != null) return micros(micro);
  const spend = pick(row, 'spend', 'SPEND');
  if (spend != null) {
    const n = num(spend);
    return n > 10_000 && Number.isInteger(n) ? n / 1e6 : n;
  }
  return 0;
}

function statsToMetrics(row: Record<string, unknown>): BaseMetrics {
  const m = zeroMetrics();
  m.spend = parseSpend(row);
  m.impressions = num(pick(row, 'impressions', 'IMPRESSIONS'));
  m.clicks = num(pick(row, 'clicks', 'CLICKS'));
  m.linkClicks = m.clicks;

  const purchaseClicks = num(pick(row, 'conversion_purchase_clicks', 'CONVERSION_PURCHASE_CLICKS'));
  const purchaseViews = num(pick(row, 'conversion_purchase_views', 'CONVERSION_PURCHASE_VIEWS'));
  m.purchases = purchaseClicks + purchaseViews;
  const purchaseValue = pick(row, 'conversion_purchase_total_value', 'CONVERSION_PURCHASE_TOTAL_VALUE', 'purchase_value');
  if (purchaseValue != null) m.purchaseValue = micros(purchaseValue);

  const started = num(pick(row, 'video_started', 'VIDEO_STARTED', 'video_views', 'VIDEO_VIEWS'));
  m.videoPlays = started;
  m.video3s = started;
  m.p25 = num(pick(row, 'video_watched_25_percent', 'VIDEO_WATCHED_25_PERCENT'));
  m.p50 = num(pick(row, 'video_watched_50_percent', 'VIDEO_WATCHED_50_PERCENT'));
  m.p75 = num(pick(row, 'video_watched_75_percent', 'VIDEO_WATCHED_75_PERCENT'));
  m.p100 = num(pick(row, 'video_watched_100_percent', 'VIDEO_WATCHED_100_PERCENT', 'video_completions'));
  return m;
}

async function fetchAdReport(
  token: string,
  accountId: string,
  range: { startDate: string; endDate: string },
): Promise<Map<string, BaseMetrics>> {
  // Reddit reports require hourly timestamps (…THH:00:00Z). Use [start, end+1d) UTC.
  const [ey, em, ed] = range.endDate.split('-').map(Number);
  const endsAt = `${shiftYmd(ey, em, ed, 1)}T00:00:00Z`;
  const build = (fields: string[]) => ({
    data: {
      breakdowns: ['AD_ID'],
      starts_at: `${range.startDate}T00:00:00Z`,
      ends_at: endsAt,
      fields,
    },
  });

  const byAd = new Map<string, BaseMetrics>();
  const ingest = (data: unknown) => {
    for (const row of normalizeReportRows(data)) {
      const adId = reportAdId(row);
      if (!adId) continue;
      const prev = byAd.get(adId) ?? zeroMetrics();
      const next = statsToMetrics(row);
      // Multiple rows per ad (e.g. date breakdown) — sum additive bases.
      byAd.set(adId, {
        ...prev,
        spend: prev.spend + next.spend,
        impressions: prev.impressions + next.impressions,
        clicks: prev.clicks + next.clicks,
        linkClicks: prev.linkClicks + next.linkClicks,
        purchases: prev.purchases + next.purchases,
        purchaseValue: prev.purchaseValue + next.purchaseValue,
        videoPlays: prev.videoPlays + next.videoPlays,
        video3s: prev.video3s + next.video3s,
        p25: prev.p25 + next.p25,
        p50: prev.p50 + next.p50,
        p75: prev.p75 + next.p75,
        p100: prev.p100 + next.p100,
      });
    }
  };

  const reportUrl = `${API}/ad_accounts/${accountId}/reports`;
  const runReport = async (fields: string[]) => {
    const body = build(fields);
    let url: string | undefined = reportUrl;
    for (let page = 0; page < 200 && url; page++) {
      const json = await redditFetch(url, token, { method: 'POST', body });
      ingest(json.data);
      url = json.pagination?.next_url ?? undefined;
    }
  };

  try {
    await runReport(REPORT_FIELDS_EXTENDED);
  } catch {
    byAd.clear();
    await runReport(REPORT_FIELDS_CORE);
  }

  return byAd;
}

const decodeHtml = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

interface RedditPostInfo { thumbnailUrl: string | null; isVideo: boolean }

/**
 * Resolve thumbnails + media type for ad posts via Reddit's data API
 * (oauth.reddit.com/api/info, batched 100 ids/call). Requires the token to
 * carry the `read` scope in addition to `adsread`; if it doesn't, the call
 * 403s and we degrade gracefully to the card placeholder.
 */
async function fetchPostInfo(postIds: string[], token: string): Promise<Map<string, RedditPostInfo>> {
  const out = new Map<string, RedditPostInfo>();
  for (let i = 0; i < postIds.length; i += 100) {
    const batch = postIds.slice(i, i + 100);
    let res: Response;
    try {
      res = await fetch(`https://oauth.reddit.com/api/info?id=${batch.join(',')}`, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA },
      });
    } catch {
      return out;
    }
    if (!res.ok) return out; // 403 (missing `read` scope) → no thumbnails this run
    const json = (await res.json()) as {
      data?: { children?: Array<{ data?: Record<string, unknown> }> };
    };
    for (const child of json.data?.children ?? []) {
      const p = child.data ?? {};
      const name = typeof p.name === 'string' ? p.name : null;
      if (!name) continue;
      const preview = (p.preview as { images?: Array<{ source?: { url?: string } }> } | undefined)
        ?.images?.[0]?.source?.url;
      const thumb = typeof p.thumbnail === 'string' && /^https?:/.test(p.thumbnail) ? p.thumbnail : null;
      const url = preview ? decodeHtml(preview) : thumb;
      out.set(name, { thumbnailUrl: url, isVideo: p.is_video === true });
    }
  }
  return out;
}

async function fetchCreatives(opts: FetchOptions): Promise<CreativeResponse> {
  const creds = loadCredentials();
  const token = await getAccessToken(creds);
  const acct = creds.adAccountId;

  const acctRaw = await redditRequest<RedditAdAccount>(`/ad_accounts/${acct}`, token);
  const timeZone = acctRaw.time_zone_id ?? acctRaw.timezone ?? 'America/Los_Angeles';
  const account: AccountInfo = {
    id: acct,
    name: acctRaw.name ?? 'Reddit',
    currency: acctRaw.currency ?? 'USD',
    timezone: timeZone,
  };

  const range = resolveRange(opts, timeZone);

  const [ads, campaigns, adGroups, statsByAd] = await Promise.all([
    redditListAll<RedditAd>(`/ad_accounts/${acct}/ads`, token),
    redditListAll<RedditNamedEntity>(`/ad_accounts/${acct}/campaigns`, token),
    redditListAll<RedditNamedEntity>(`/ad_accounts/${acct}/ad_groups`, token),
    fetchAdReport(token, acct, range),
  ]);

  const campaignById = new Map(campaigns.map((c) => [c.id, c.name ?? '(campaign)']));
  const adGroupById = new Map(adGroups.map((g) => [g.id, g.name ?? '(ad group)']));

  const allRows: CreativeRow[] = ads.map((ad): CreativeRow => {
    const metrics = statsByAd.get(ad.id) ?? zeroMetrics();
    return {
      adId: ad.id,
      adName: ad.name ?? '(unnamed)',
      status: ad.effective_status ?? ad.configured_status ?? 'UNKNOWN',
      campaignName: ad.campaign_id ? (campaignById.get(ad.campaign_id) ?? '(Reddit)') : '(Reddit)',
      adsetName: ad.ad_group_id ? (adGroupById.get(ad.ad_group_id) ?? '(Reddit)') : '(Reddit)',
      objective: '',
      createdTime: ad.created_at ?? null,
      creativeId: ad.post_id ?? ad.creative_id ?? null,
      objectType: 'PHOTO',
      videoId: null,
      imageHash: ad.post_id ?? ad.creative_id ?? null,
      permalink: ad.post_url ?? ad.click_url ?? null,
      thumbnailUrl: null,
      geo: null,
      primaryTexts: [],
      headlines: [],
      metrics,
    };
  });

  // Only ads that actually delivered in range (matches Meta/Snap behavior).
  const rows = allRows.filter((r) => r.metrics.impressions > 0 || r.metrics.spend > 0);

  // Resolve thumbnails for delivering ads from their linked posts.
  const postIds = [...new Set(
    rows.map((_, i) => ads.find((a) => a.id === rows[i].adId)?.post_id).filter((x): x is string => !!x),
  )];
  if (postIds.length) {
    const info = await fetchPostInfo(postIds, token);
    const adById = new Map(ads.map((a) => [a.id, a]));
    for (const r of rows) {
      const postId = adById.get(r.adId)?.post_id;
      const meta = postId ? info.get(postId) : undefined;
      if (!meta) continue;
      r.thumbnailUrl = meta.thumbnailUrl;
      if (meta.isVideo) {
        r.objectType = 'VIDEO';
        r.videoId = postId ?? null;
        r.imageHash = null;
      }
    }
  }

  return {
    account,
    range: { label: range.label, since: range.startDate, until: range.endDate },
    rows,
    fetchedAt: new Date().toISOString(),
  };
}

export const redditAdapter: PlatformAdapter = {
  id: 'reddit',
  label: 'Reddit',
  requiredEnv: REQUIRED_ENV,
  isConfigured: () => missingEnv(REQUIRED_ENV).length === 0,
  fetchCreatives,
};
