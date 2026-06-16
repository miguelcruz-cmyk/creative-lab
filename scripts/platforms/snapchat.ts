/**
 * Snapchat Ads adapter — Snap Marketing API.
 *
 * Auth: Snap OAuth. Access tokens are short-lived (~1h), so we store a refresh
 *   token + client id/secret and mint an access token per pull.
 * Base URL: https://adsapi.snapchat.com/v1/
 *
 * Pull shape (mirrors the Meta adapter — flat additive rows joined to creatives):
 *   1) Ad account meta  → name/currency/timezone.
 *   2) Ads (paginated)  → id, name, status, created_at, creative_id.
 *   3) Creatives        → type + top_snap_media_id (used for format + video id).
 *   4) Per-ad stats     → spend/impressions/swipes/video quartiles/conversions.
 *   5) Media            → type (VIDEO/IMAGE) + thumbnails for delivering ads.
 *
 * Money + value fields come back in MICRO-currency (÷ 1e6). Snap's 2-second
 * video view maps to our `video3s` (hook rate); quartiles map to p25/p50/p75.
 *
 * Thumbnails: image media carries a permanent `download_link`; video media
 * thumbnails come from GET /media/{id}/thumbnail, whose signed links expire in
 * ~24h. The cron warmer re-pulls every 12h, so stored links stay valid in the
 * normal case; a long-stale snapshot degrades to the card placeholder.
 */
import { missingEnv, PlatformNotConfiguredError, type FetchOptions, type PlatformAdapter } from './types.js';
import type { AccountInfo, BaseMetrics, CreativeResponse, CreativeRow } from '../meta-creative-api/metaApi.js';

const REQUIRED_ENV = [
  'SNAPCHAT_CLIENT_ID',
  'SNAPCHAT_CLIENT_SECRET',
  'SNAPCHAT_REFRESH_TOKEN',
  'SNAPCHAT_AD_ACCOUNT_ID',
];

const AUTH_URL = 'https://accounts.snapchat.com/login/oauth2/access_token';
const API = 'https://adsapi.snapchat.com/v1';

interface SnapchatCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  adAccountId: string;
}

function loadCredentials(): SnapchatCredentials {
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length) throw new PlatformNotConfiguredError('snapchat', missing);
  return {
    clientId: process.env.SNAPCHAT_CLIENT_ID!.trim(),
    clientSecret: process.env.SNAPCHAT_CLIENT_SECRET!.trim(),
    refreshToken: process.env.SNAPCHAT_REFRESH_TOKEN!.trim(),
    adAccountId: process.env.SNAPCHAT_AD_ACCOUNT_ID!.trim(),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const micros = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n / 1e6 : 0;
};
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

async function getAccessToken(c: SnapchatCredentials): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: c.refreshToken,
    client_id: c.clientId,
    client_secret: c.clientSecret,
  });
  const res = await fetch(AUTH_URL, { method: 'POST', body });
  const json = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`Snapchat auth failed: ${json.error_description ?? json.error ?? res.statusText}`);
  }
  return json.access_token;
}

async function snapGet<T>(url: string, token: string, attempt = 0): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 4) {
      await sleep(1500 * 2 ** attempt);
      return snapGet<T>(url, token, attempt + 1);
    }
  }
  const json = (await res.json()) as Record<string, unknown>;
  const status = (json.request_status as string) ?? '';
  if (!res.ok || (status && status !== 'SUCCESS')) {
    const msg =
      (json.debug_message as string) ??
      (json.error_description as string) ??
      (json.message as string) ??
      res.statusText;
    throw new Error(`Snapchat API error (${res.status}): ${msg}`);
  }
  return json as T;
}

/** Paginate Snap list endpoints via paging.next_link (an absolute URL). */
async function snapPaginate<T>(firstUrl: string, token: string, key: string, maxPages = 50): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = firstUrl;
  for (let page = 0; page < maxPages && url; page++) {
    const json: Record<string, unknown> = await snapGet<Record<string, unknown>>(url, token);
    const list = (json[key] as T[]) ?? [];
    out.push(...list);
    const paging = json.paging as { next_link?: string } | undefined;
    url = paging?.next_link;
  }
  return out;
}

// ---- Date range helpers (Snap stats need explicit, tz-aligned ISO bounds) ----

function tzOffset(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const m = name.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : '+00:00';
}

function ymdInTz(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Add days to a Y/M/D and return a 'YYYY-MM-DD' string (UTC calendar math). */
function shiftYmd(y: number, m: number, d: number, days: number): string {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

const PRESET_DAYS: Record<string, number> = { last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 };

/** Resolve FetchOptions → Snap start_time/end_time (end exclusive), tz-aligned. */
function resolveRange(opts: FetchOptions, timeZone: string): { startTime: string; endTime: string; label: string } {
  const now = new Date();
  const offset = tzOffset(timeZone, now);
  const today = ymdInTz(now, timeZone);
  const at = (dateStr: string) => `${dateStr}T00:00:00.000${offset}`;

  if (opts.since && opts.until) {
    const [uy, um, ud] = opts.until.split('-').map(Number);
    return { startTime: at(opts.since), endTime: at(shiftYmd(uy, um, ud, 1)), label: `${opts.since} → ${opts.until}` };
  }

  const preset = opts.datePreset ?? 'last_14d';
  if (preset === 'this_month') {
    const start = `${today.y}-${String(today.m).padStart(2, '0')}-01`;
    return { startTime: at(start), endTime: at(shiftYmd(today.y, today.m, today.d, 1)), label: 'This month' };
  }
  if (preset === 'last_month') {
    const firstThis = shiftYmd(today.y, today.m, 1, 0);
    const [ly, lm] = firstThis.split('-').map(Number);
    const startLast = shiftYmd(ly, lm, 1, -1); // last day of prev month
    const [py, pm] = startLast.split('-').map(Number);
    const firstLast = `${py}-${String(pm).padStart(2, '0')}-01`;
    return { startTime: at(firstLast), endTime: at(firstThis), label: 'Last month' };
  }
  const days = PRESET_DAYS[preset] ?? 14;
  const start = shiftYmd(today.y, today.m, today.d, -(days - 1));
  const end = shiftYmd(today.y, today.m, today.d, 1);
  return { startTime: at(start), endTime: at(end), label: preset.replace('last_', 'Last ').replace('d', ' days') };
}

// ---- Snap entity types (only the fields we read) ----

interface SnapAd { id: string; name?: string; status?: string; created_at?: string; creative_id?: string; }
interface SnapCreative { id: string; name?: string; type?: string; top_snap_media_id?: string; headline?: string; }
interface SnapMedia { id: string; type?: string; download_link?: string; }

/** Run async work over items with bounded concurrency. */
async function mapLimit<I, O>(items: I[], limit: number, worker: (item: I) => Promise<O>): Promise<O[]> {
  const out: O[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(worker))));
  }
  return out;
}

/**
 * Resolve a thumbnail URL per media id. Image media uses its permanent
 * download_link directly; video media uses the signed thumbnail endpoint
 * (best-effort — a missing thumbnail just leaves the card placeholder).
 */
async function fetchThumbnails(
  mediaIds: string[],
  mediaById: Map<string, SnapMedia>,
  token: string,
): Promise<Map<string, string>> {
  const thumbs = new Map<string, string>();
  const videoIds: string[] = [];
  for (const id of mediaIds) {
    const media = mediaById.get(id);
    if (media?.type === 'IMAGE' && media.download_link) thumbs.set(id, media.download_link);
    else videoIds.push(id);
  }
  await mapLimit(videoIds, 8, async (id) => {
    try {
      const json = await snapGet<{ link?: string }>(`${API}/media/${id}/thumbnail`, token);
      if (json.link) thumbs.set(id, json.link);
    } catch {
      /* no thumbnail available — leave placeholder */
    }
  });
  return thumbs;
}

const STAT_FIELDS = [
  'spend', 'impressions', 'swipes', 'video_views', 'video_views_15s',
  'quartile_1', 'quartile_2', 'quartile_3', 'view_completion', 'screen_time_millis',
  'shares', 'saves', 'conversion_purchases', 'conversion_purchases_value',
].join(',');
const CORE_STAT_FIELDS = ['spend', 'impressions', 'swipes', 'video_views'].join(',');

function statsToMetrics(s: Record<string, number>): BaseMetrics {
  const m = zeroMetrics();
  m.spend = micros(s.spend);
  m.impressions = num(s.impressions);
  m.clicks = num(s.swipes);
  m.linkClicks = num(s.swipes);
  m.videoPlays = num(s.video_views);
  m.video3s = num(s.video_views); // Snap counts a view at 2s → our hook proxy
  m.thruplays = num(s.video_views_15s); // 15s view → hold proxy
  m.p25 = num(s.quartile_1);
  m.p50 = num(s.quartile_2);
  m.p75 = num(s.quartile_3);
  m.p100 = num(s.view_completion);
  m.videoWatchSeconds = num(s.screen_time_millis) / 1000;
  m.shares = num(s.shares);
  m.saves = num(s.saves);
  m.postEngagement = num(s.shares) + num(s.saves);
  m.purchases = num(s.conversion_purchases);
  m.purchaseValue = micros(s.conversion_purchases_value);
  return m;
}

interface AccountStatsResponse {
  total_stats?: Array<{ total_stat?: { breakdown_stats?: { ad?: Array<{ id: string; stats?: Record<string, number> }> } }; paging?: { next_link?: string } }>;
  paging?: { next_link?: string };
}

/**
 * Pull per-ad stats for the whole account in one request via breakdown=ad
 * (orders of magnitude faster than per-ad calls). Returns adId → raw stats.
 */
async function fetchAccountAdStats(
  token: string,
  acct: string,
  startTime: string,
  endTime: string,
): Promise<Map<string, Record<string, number>>> {
  const build = (fields: string) =>
    `${API}/adaccounts/${acct}/stats?granularity=TOTAL&breakdown=ad&fields=${fields}` +
    `&start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}`;

  const byAd = new Map<string, Record<string, number>>();
  let url: string | undefined;
  try {
    url = build(STAT_FIELDS);
  } catch {
    url = build(CORE_STAT_FIELDS);
  }
  // First request may fail on an unsupported field; fall back to the core set.
  let first = true;
  for (let page = 0; page < 50 && url; page++) {
    let json: AccountStatsResponse;
    try {
      json = await snapGet<AccountStatsResponse>(url, token);
    } catch (err) {
      if (first) {
        url = build(CORE_STAT_FIELDS);
        first = false;
        json = await snapGet<AccountStatsResponse>(url, token);
      } else {
        throw err;
      }
    }
    first = false;
    const node = json.total_stats?.[0];
    for (const ad of node?.total_stat?.breakdown_stats?.ad ?? []) {
      if (ad.id) byAd.set(ad.id, ad.stats ?? {});
    }
    url = node?.paging?.next_link ?? json.paging?.next_link;
  }
  return byAd;
}

async function fetchCreatives(opts: FetchOptions): Promise<CreativeResponse> {
  const creds = loadCredentials();
  const token = await getAccessToken(creds);
  const acct = creds.adAccountId;

  // 1) Account meta.
  const acctJson = await snapGet<{ adaccounts?: Array<{ adaccount?: { id: string; name?: string; currency?: string; timezone?: string } }> }>(
    `${API}/adaccounts/${acct}`,
    token,
  );
  const raw = acctJson.adaccounts?.[0]?.adaccount;
  const timeZone = raw?.timezone ?? 'America/Los_Angeles';
  const account: AccountInfo = {
    id: acct,
    name: raw?.name ?? 'Snapchat',
    currency: raw?.currency ?? 'USD',
    timezone: timeZone,
  };

  const range = resolveRange(opts, timeZone);

  // 2) Ads + 3) Creatives + 4) per-ad stats + 5) media, in parallel.
  const [ads, creatives, statsByAd, mediaList] = await Promise.all([
    snapPaginate<{ ad: SnapAd }>(`${API}/adaccounts/${acct}/ads?limit=200`, token, 'ads'),
    snapPaginate<{ creative: SnapCreative }>(`${API}/adaccounts/${acct}/creatives?limit=200`, token, 'creatives'),
    fetchAccountAdStats(token, acct, range.startTime, range.endTime),
    snapPaginate<{ media: SnapMedia }>(`${API}/adaccounts/${acct}/media?limit=200`, token, 'media'),
  ]);
  const creativeById = new Map<string, SnapCreative>();
  for (const c of creatives) creativeById.set(c.creative.id, c.creative);
  const mediaById = new Map<string, SnapMedia>();
  for (const m of mediaList) mediaById.set(m.media.id, m.media);

  const allRows: CreativeRow[] = ads.map(({ ad }): CreativeRow => {
    const creative = ad.creative_id ? creativeById.get(ad.creative_id) : undefined;
    const mediaId = creative?.top_snap_media_id ?? null;
    const mediaType = mediaId ? mediaById.get(mediaId)?.type : undefined;
    const isVideo = mediaType ? mediaType === 'VIDEO' : !!mediaId || (creative?.type ?? '').toUpperCase().includes('VIDEO');
    const metrics = statsToMetrics(statsByAd.get(ad.id) ?? {});
    return {
      adId: ad.id,
      adName: ad.name ?? '(unnamed)',
      status: ad.status ?? 'UNKNOWN',
      campaignName: '(Snapchat)',
      adsetName: '(Snapchat)',
      objective: '',
      createdTime: ad.created_at ?? null,
      creativeId: ad.creative_id ?? null,
      objectType: isVideo ? 'VIDEO' : 'PHOTO',
      videoId: isVideo ? mediaId : null,
      imageHash: !isVideo ? mediaId : null,
      permalink: null,
      thumbnailUrl: null,
      geo: null,
      primaryTexts: [],
      headlines: creative?.headline ? [creative.headline] : [],
      metrics,
    };
  });

  // Only surface ads that actually delivered in range (matches Meta's behavior).
  const rows = allRows.filter((r) => r.metrics.impressions > 0 || r.metrics.spend > 0);

  // 6) Thumbnails — only for media actually used by delivering ads.
  const usedMediaIds = new Map<string, CreativeRow[]>();
  for (const r of rows) {
    const id = r.videoId ?? r.imageHash;
    if (!id) continue;
    const list = usedMediaIds.get(id);
    if (list) list.push(r);
    else usedMediaIds.set(id, [r]);
  }
  const thumbs = await fetchThumbnails([...usedMediaIds.keys()], mediaById, token);
  for (const [id, group] of usedMediaIds) {
    const url = thumbs.get(id);
    if (url) for (const r of group) r.thumbnailUrl = url;
  }

  return {
    account,
    range: { label: range.label },
    rows,
    fetchedAt: new Date().toISOString(),
  };
}

export const snapchatAdapter: PlatformAdapter = {
  id: 'snapchat',
  label: 'Snapchat',
  requiredEnv: REQUIRED_ENV,
  isConfigured: () => missingEnv(REQUIRED_ENV).length === 0,
  fetchCreatives,
};
