/**
 * TikTok Ads adapter — TikTok for Business Marketing API (v1.3).
 *
 * Auth: long-lived access token in the `Access-Token` header (NOT a query
 *   param). App id/secret are only needed to mint tokens; once you have a
 *   token, just TIKTOK_ACCESS_TOKEN + TIKTOK_ADVERTISER_ID are required.
 * Base URL: https://business-api.tiktok.com/open_api/v1.3/
 * Envelope: HTTP 200 with `{ code, message, data }` — `code !== 0` is an error
 *   (including rate limits), so errors are detected from the body.
 *
 * Pull shape (mirrors Meta/Snap/Reddit — flat additive rows):
 *   1) Advertiser info  → name/currency/timezone.
 *   2) Ads (paginated)  → names, status, created, campaign/adgroup names
 *                         (returned inline — no separate joins needed), ad_text,
 *                         video_id / image_ids.
 *   3) AD-level report  → spend/impressions/reach/clicks/conversions/video funnel.
 *      Extended metric set first, falls back to a core set if the account
 *      rejects any metric.
 *   4) Thumbnails       → /file/video/ad/info/ (video covers) and
 *                         /file/image/ad/info/ (statics), batched.
 */
import { missingEnv, PlatformNotConfiguredError, type FetchOptions, type PlatformAdapter } from './types.js';
import type { AccountInfo, BaseMetrics, CreativeResponse, CreativeRow } from '../meta-creative-api/metaApi.js';

const REQUIRED_ENV = ['TIKTOK_ACCESS_TOKEN', 'TIKTOK_ADVERTISER_ID'];

const API = 'https://business-api.tiktok.com/open_api/v1.3';

interface TikTokCredentials {
  accessToken: string;
  advertiserId: string;
}

function loadCredentials(): TikTokCredentials {
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length) throw new PlatformNotConfiguredError('tiktok', missing);
  return {
    accessToken: process.env.TIKTOK_ACCESS_TOKEN!.trim(),
    advertiserId: process.env.TIKTOK_ADVERTISER_ID!.trim().replace(/^act_/, ''),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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

interface TikTokEnvelope {
  code?: number;
  message?: string;
  data?: unknown;
}

/**
 * One GET against the API. TikTok encodes array params as JSON strings and
 * returns HTTP 200 even for errors — `code !== 0` is the failure signal.
 * Retries transient rate limits (code 40100) with backoff.
 */
async function tiktokGet<T>(
  path: string,
  token: string,
  params: Record<string, string | number | string[] | number[]>,
  attempt = 0,
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    qs.set(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
  }
  const res = await fetch(`${API}${path}?${qs}`, { headers: { 'Access-Token': token } });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(1500 * 2 ** attempt);
    return tiktokGet(path, token, params, attempt + 1);
  }
  const json = (await res.json().catch(() => ({}))) as TikTokEnvelope;
  if (json.code === 40100 && attempt < 4) {
    await sleep(1500 * 2 ** attempt);
    return tiktokGet(path, token, params, attempt + 1);
  }
  if (!res.ok || json.code !== 0) {
    throw new Error(`TikTok API error (${json.code ?? res.status}) ${path}: ${json.message ?? res.statusText}`);
  }
  return json.data as T;
}

interface PageInfo {
  page?: number;
  total_page?: number;
}

/** Page through a list endpooint until `page_info.total_page` is exhausted. */
async function tiktokListAll<T>(
  path: string,
  token: string,
  params: Record<string, string | number | string[] | number[]>,
  maxPages = 100,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await tiktokGet<{ list?: T[]; page_info?: PageInfo }>(path, token, {
      ...params,
      page,
      page_size: 1000,
    });
    out.push(...(data.list ?? []));
    const totalPages = data.page_info?.total_page ?? 1;
    if (page >= totalPages) break;
  }
  return out;
}

// ---- Date range (YYYY-MM-DD in the advertiser's timezone) ----

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
  const today = ymdInTz(new Date(), timeZone);

  if (opts.since && opts.until) {
    return { startDate: opts.since, endDate: opts.until, label: `${opts.since} → ${opts.until}` };
  }

  const preset = opts.datePreset ?? 'last_14d';
  if (preset === 'this_month') {
    return { startDate: fmtYmd(today.y, today.m, 1), endDate: fmtYmd(today.y, today.m, today.d), label: 'This month' };
  }
  if (preset === 'last_month') {
    const lastDayPrev = shiftYmd(today.y, today.m, 1, -1);
    const [py, pm] = lastDayPrev.split('-').map(Number);
    return { startDate: fmtYmd(py, pm, 1), endDate: lastDayPrev, label: 'Last month' };
  }

  const days = PRESET_DAYS[preset] ?? 14;
  return {
    startDate: shiftYmd(today.y, today.m, today.d, -(days - 1)),
    endDate: fmtYmd(today.y, today.m, today.d),
    label: preset.replace('last_', 'Last ').replace('d', ' days'),
  };
}

// ---- Entities ----

interface TikTokAdvertiser {
  advertiser_id?: string;
  name?: string;
  currency?: string;
  timezone?: string;
  display_timezone?: string;
}

interface TikTokAd {
  ad_id: string;
  ad_name?: string;
  operation_status?: string;
  secondary_status?: string;
  create_time?: string;
  campaign_id?: string;
  campaign_name?: string;
  adgroup_id?: string;
  adgroup_name?: string;
  ad_format?: string;
  ad_text?: string;
  video_id?: string | null;
  image_ids?: string[] | null;
  landing_page_url?: string | null;
  /** Spark Ads: the boosted organic post (no video_id/image_ids on the ad). */
  tiktok_item_id?: string | null;
  identity_id?: string | null;
  identity_type?: string | null;
}

/** Extended metric set; some accounts reject purchase metrics → core fallback. */
const METRICS_CORE = ['spend', 'impressions', 'reach', 'clicks', 'conversion'];

const METRICS_EXTENDED = [
  ...METRICS_CORE,
  'video_play_actions',
  'video_watched_2s',
  'video_watched_6s',
  'video_views_p25',
  'video_views_p50',
  'video_views_p75',
  'video_views_p100',
  'likes',
  'comments',
  'shares',
];

interface ReportRow {
  dimensions?: { ad_id?: string };
  metrics?: Record<string, unknown>;
}

function rowToMetrics(metrics: Record<string, unknown>): BaseMetrics {
  const m = zeroMetrics();
  m.spend = num(metrics.spend);
  m.impressions = num(metrics.impressions);
  m.reach = num(metrics.reach);
  m.clicks = num(metrics.clicks);
  m.linkClicks = m.clicks; // TikTok clicks are destination clicks
  // `conversion` is the ad group's optimization event count — the "result" the
  // account is buying (signups for us). Map to purchases so CPA-style metrics work.
  m.purchases = num(metrics.conversion);
  m.videoPlays = num(metrics.video_play_actions);
  m.video3s = num(metrics.video_watched_2s) || m.videoPlays;
  m.thruplays = num(metrics.video_watched_6s);
  m.p25 = num(metrics.video_views_p25);
  m.p50 = num(metrics.video_views_p50);
  m.p75 = num(metrics.video_views_p75);
  m.p100 = num(metrics.video_views_p100);
  m.reactions = num(metrics.likes);
  m.comments = num(metrics.comments);
  m.shares = num(metrics.shares);
  m.postEngagement = m.reactions + m.comments + m.shares;
  return m;
}

async function fetchAdReport(
  token: string,
  advertiserId: string,
  range: { startDate: string; endDate: string },
): Promise<Map<string, BaseMetrics>> {
  const run = async (metrics: string[]) => {
    const rows = await tiktokListAll<ReportRow>('/report/integrated/get/', token, {
      advertiser_id: advertiserId,
      report_type: 'BASIC',
      data_level: 'AUCTION_AD',
      dimensions: ['ad_id'],
      metrics,
      start_date: range.startDate,
      end_date: range.endDate,
    });
    const byAd = new Map<string, BaseMetrics>();
    for (const row of rows) {
      const adId = row.dimensions?.ad_id;
      if (!adId || !row.metrics) continue;
      byAd.set(String(adId), rowToMetrics(row.metrics));
    }
    return byAd;
  };

  try {
    return await run(METRICS_EXTENDED);
  } catch {
    return run(METRICS_CORE);
  }
}

/** Video covers + image URLs for thumbnails, batched per the API limits. */
async function fetchThumbnails(
  token: string,
  advertiserId: string,
  videoIds: string[],
  imageIds: string[],
): Promise<{ videoCover: Map<string, string>; imageUrl: Map<string, string> }> {
  const videoCover = new Map<string, string>();
  const imageUrl = new Map<string, string>();

  for (let i = 0; i < videoIds.length; i += 60) {
    try {
      const data = await tiktokGet<{ list?: Array<{ video_id?: string; video_cover_url?: string; poster_url?: string }> }>(
        '/file/video/ad/info/',
        token,
        { advertiser_id: advertiserId, video_ids: videoIds.slice(i, i + 60) },
      );
      for (const v of data.list ?? []) {
        const url = v.video_cover_url ?? v.poster_url;
        if (v.video_id && url) videoCover.set(v.video_id, url);
      }
    } catch {
      break; // thumbnails are progressive enhancement — never fail the pull
    }
  }

  for (let i = 0; i < imageIds.length; i += 100) {
    try {
      const data = await tiktokGet<{ list?: Array<{ image_id?: string; image_url?: string }> }>(
        '/file/image/ad/info/',
        token,
        { advertiser_id: advertiserId, image_ids: imageIds.slice(i, i + 100) },
      );
      for (const img of data.list ?? []) {
        if (img.image_id && img.image_url) imageUrl.set(img.image_id, img.image_url);
      }
    } catch {
      break;
    }
  }

  return { videoCover, imageUrl };
}

/**
 * Posters for Spark Ads (boosted organic posts). Those ads carry no
 * video_id/image_ids — only `tiktok_item_id` + `identity_id` — so the file
 * endpoints can't see them. /identity/video/info/ is per-item; run a small
 * concurrent pool to keep large accounts reasonable.
 */
async function fetchSparkPosters(
  token: string,
  advertiserId: string,
  items: Array<{ itemId: string; identityId: string; identityType: string }>,
): Promise<Map<string, string>> {
  const posterByItem = new Map<string, string>();
  const queue = [...items];
  const CONCURRENCY = 6;

  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const data = await tiktokGet<{
          video_detail?: { item_id?: string; video_info?: { poster_url?: string } };
        }>('/identity/video/info/', token, {
          advertiser_id: advertiserId,
          identity_type: item.identityType,
          identity_id: item.identityId,
          item_id: item.itemId,
        });
        const poster = data.video_detail?.video_info?.poster_url;
        if (poster) posterByItem.set(item.itemId, poster);
      } catch {
        // thumbnails are progressive enhancement — skip failures
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return posterByItem;
}

/** "2026-06-01 14:30:00" (advertiser tz) → ISO-ish string the UI can parse. */
function toIso(createTime: string | undefined): string | null {
  if (!createTime) return null;
  return createTime.includes('T') ? createTime : createTime.replace(' ', 'T');
}

async function fetchCreatives(opts: FetchOptions): Promise<CreativeResponse> {
  const creds = loadCredentials();
  const token = creds.accessToken;
  const advertiserId = creds.advertiserId;

  // /advertiser/info/ needs its own scope that some tokens lack; fall back to
  // the oauth2 listing (name only, authorized for any minted token) + defaults.
  let adv: TikTokAdvertiser = {};
  try {
    const advData = await tiktokGet<{ list?: TikTokAdvertiser[] }>('/advertiser/info/', token, {
      advertiser_ids: [advertiserId],
    });
    adv = advData.list?.[0] ?? {};
  } catch {
    const appId = process.env.TIKTOK_APP_ID?.trim();
    const secret = process.env.TIKTOK_APP_SECRET?.trim();
    if (appId && secret) {
      try {
        const fallback = await tiktokGet<{ list?: Array<{ advertiser_id?: string; advertiser_name?: string }> }>(
          '/oauth2/advertiser/get/',
          token,
          { app_id: appId, secret },
        );
        const match = (fallback.list ?? []).find((a) => String(a.advertiser_id) === advertiserId);
        adv = { name: match?.advertiser_name };
      } catch {
        /* defaults below */
      }
    }
  }
  const timeZone = adv.display_timezone ?? adv.timezone ?? 'America/Los_Angeles';
  const account: AccountInfo = {
    id: advertiserId,
    name: adv.name ?? 'TikTok',
    currency: adv.currency ?? 'USD',
    timezone: timeZone,
  };

  const range = resolveRange(opts, timeZone);

  const [ads, statsByAd] = await Promise.all([
    tiktokListAll<TikTokAd>('/ad/get/', token, {
      advertiser_id: advertiserId,
      fields: [
        'ad_id', 'ad_name', 'operation_status', 'secondary_status', 'create_time',
        'campaign_id', 'campaign_name', 'adgroup_id', 'adgroup_name',
        'ad_format', 'ad_text', 'video_id', 'image_ids', 'landing_page_url',
        'tiktok_item_id', 'identity_id', 'identity_type',
      ],
    }),
    fetchAdReport(token, advertiserId, range),
  ]);

  // Spark Ads reference an organic post instead of an uploaded file; track the
  // post + identity per ad so thumbnails can be resolved below.
  const sparkByAd = new Map<string, { itemId: string; identityId: string; identityType: string }>();
  for (const ad of ads) {
    if (!ad.video_id && !ad.image_ids?.length && ad.tiktok_item_id && ad.identity_id) {
      sparkByAd.set(String(ad.ad_id), {
        itemId: ad.tiktok_item_id,
        identityId: ad.identity_id,
        identityType: ad.identity_type ?? 'AUTH_CODE',
      });
    }
  }

  const allRows: CreativeRow[] = ads.map((ad): CreativeRow => {
    const metrics = statsByAd.get(String(ad.ad_id)) ?? zeroMetrics();
    const isVideo = !!ad.video_id || !!ad.tiktok_item_id;
    return {
      adId: String(ad.ad_id),
      adName: ad.ad_name ?? '(unnamed)',
      status: ad.secondary_status ?? ad.operation_status ?? 'UNKNOWN',
      campaignName: ad.campaign_name ?? '(TikTok)',
      adsetName: ad.adgroup_name ?? '(TikTok)',
      objective: '',
      createdTime: toIso(ad.create_time),
      creativeId: ad.video_id ?? ad.image_ids?.[0] ?? ad.tiktok_item_id ?? null,
      objectType: isVideo ? 'VIDEO' : 'PHOTO',
      videoId: ad.video_id ?? null,
      imageHash: ad.image_ids?.[0] ?? null,
      permalink: ad.landing_page_url ?? null,
      thumbnailUrl: null,
      geo: null,
      primaryTexts: ad.ad_text ? [ad.ad_text] : [],
      headlines: [],
      metrics,
    };
  });

  // Only ads that actually delivered in range (matches the other platforms).
  const rows = allRows.filter((r) => r.metrics.impressions > 0 || r.metrics.spend > 0);

  const videoIds = [...new Set(rows.map((r) => r.videoId).filter((x): x is string => !!x))];
  const imageIds = [...new Set(rows.map((r) => r.imageHash).filter((x): x is string => !!x))];
  if (videoIds.length || imageIds.length) {
    const { videoCover, imageUrl } = await fetchThumbnails(token, advertiserId, videoIds, imageIds);
    for (const r of rows) {
      r.thumbnailUrl =
        (r.videoId ? videoCover.get(r.videoId) : undefined) ??
        (r.imageHash ? imageUrl.get(r.imageHash) : undefined) ??
        null;
    }
  }

  // Spark Ads: resolve posters for delivered rows still missing a thumbnail
  // (deduped by post — many ads boost the same item).
  const sparkItems = new Map<string, { itemId: string; identityId: string; identityType: string }>();
  for (const r of rows) {
    const spark = !r.thumbnailUrl && sparkByAd.get(r.adId);
    if (spark) sparkItems.set(spark.itemId, spark);
  }
  if (sparkItems.size) {
    const posterByItem = await fetchSparkPosters(token, advertiserId, [...sparkItems.values()]);
    for (const r of rows) {
      if (r.thumbnailUrl) continue;
      const spark = sparkByAd.get(r.adId);
      if (spark) r.thumbnailUrl = posterByItem.get(spark.itemId) ?? null;
    }
  }

  return {
    account,
    range: { label: range.label, since: range.startDate, until: range.endDate },
    rows,
    fetchedAt: new Date().toISOString(),
  };
}

export const tiktokAdapter: PlatformAdapter = {
  id: 'tiktok',
  label: 'TikTok',
  requiredEnv: REQUIRED_ENV,
  isConfigured: () => missingEnv(REQUIRED_ENV).length === 0,
  fetchCreatives,
};
