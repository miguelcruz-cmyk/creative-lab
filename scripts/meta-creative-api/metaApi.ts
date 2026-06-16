/**
 * Meta (Facebook) Marketing API data layer for the creative analysis tool.
 *
 * Runs server-side only (inside the Vite dev middleware / build tooling) so the
 * ACCESS_TOKEN never reaches the browser.
 *
 * Strategy for speed + reliability (Graph caps how much nested data one request
 * can return):
 *   1. Pull flat ad-level rows from the Insights edge (large pages, and it only
 *      returns ads that actually delivered in the range).
 *   2. Batch-fetch creative info (object type, video id, copy) by ad id.
 *   3. Batch-fetch 1080×1080 thumbnails by creative id for every ad (the nested
 *      creative thumbnail_url is ~64px and looks blurry in the UI).
 *   4. Asset fallbacks (adimages hash, video picture) for rows still missing.
 * Everything is normalized into flat, *additive* base metrics so client-side
 * group-by aggregation stays correct (sum base fields, then derive ratios).
 */

const GRAPH_VERSION = 'v21.0';
const GRAPH_ROOT = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface MetaCredentials {
  accessToken: string;
  accountId: string; // normalized, without the "act_" prefix
}

export function loadCredentials(): MetaCredentials {
  const accessToken = process.env.ACCESS_TOKEN?.trim();
  const rawAccount = process.env.AD_ACCOUNT_ID?.trim();
  if (!accessToken) throw new Error('Missing ACCESS_TOKEN in environment (.env)');
  if (!rawAccount) throw new Error('Missing AD_ACCOUNT_ID in environment (.env)');
  return { accessToken, accountId: rawAccount.replace(/^act_/, '') };
}

/** Additive base metrics — safe to sum across rows before computing ratios. */
export interface BaseMetrics {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  purchases: number;
  purchaseValue: number;
  registrations: number;
  leads: number;
  addToCart: number;
  initiateCheckout: number;
  postEngagement: number;
  reactions: number;
  comments: number;
  shares: number;
  saves: number;
  videoPlays: number;
  video3s: number;
  thruplays: number;
  videoWatchSeconds: number;
  p25: number;
  p50: number;
  p75: number;
  p100: number;
}

export interface CreativeRow {
  adId: string;
  adName: string;
  status: string;
  campaignName: string;
  adsetName: string;
  objective: string;
  /** ISO timestamp the ad was created in Meta ("went live"), when available. */
  createdTime: string | null;
  creativeId: string | null;
  objectType: string | null;
  videoId: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  /** Underlying image asset hash (statics) — used to de-dupe creative. */
  imageHash: string | null;
  /** Geo breakdown value (country code or region name) when a breakdown is requested. */
  geo: string | null;
  primaryTexts: string[];
  headlines: string[];
  metrics: BaseMetrics;
}

export interface AccountInfo {
  id: string;
  name: string;
  currency: string;
  timezone: string;
}

export interface CreativeResponse {
  account: AccountInfo;
  range: { label: string; since?: string; until?: string };
  rows: CreativeRow[];
  fetchedAt: string;
}

/** Stable order of additive metric fields, used for the compact wire format. */
export const METRIC_KEYS: (keyof BaseMetrics)[] = [
  'spend', 'impressions', 'reach', 'clicks', 'linkClicks', 'landingPageViews',
  'purchases', 'purchaseValue', 'registrations', 'leads', 'addToCart',
  'initiateCheckout', 'postEngagement', 'videoPlays', 'video3s', 'thruplays',
  'videoWatchSeconds', 'p25', 'p50', 'p75', 'p100',
  // Appended (keep prior order stable for backward-compatible wire decoding).
  'reactions', 'comments', 'shares', 'saves',
];

type GraphParams = Record<string, string | number | undefined>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimit(message: string): boolean {
  return /too many calls|rate limit|request limit reached|User request limit/i.test(message);
}

async function graphGet<T>(
  path: string,
  params: GraphParams,
  accessToken: string,
  attempt = 0,
): Promise<T> {
  const url = new URL(`${GRAPH_ROOT}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  url.searchParams.set('access_token', accessToken);
  const res = await fetch(url);
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || (json as { error?: unknown }).error) {
    const message = (json as { error?: { message?: string } }).error?.message ?? res.statusText;
    // Back off and retry transient rate-limit errors a few times.
    if (isRateLimit(message) && attempt < 4) {
      await sleep(2000 * 2 ** attempt); // 2s, 4s, 8s, 16s
      return graphGet<T>(path, params, accessToken, attempt + 1);
    }
    throw new Error(`Graph API error: ${message}`);
  }
  return json as T;
}

interface Paged<T> {
  data: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

async function paginate<T>(
  path: string,
  params: GraphParams,
  accessToken: string,
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const res = await graphGet<Paged<T>>(path, { ...params, after }, accessToken);
    out.push(...(res.data ?? []));
    after = res.paging?.cursors?.after;
    if (!after || !res.paging?.next) break;
  }
  return out;
}

/** Run async work over id batches with bounded concurrency. */
async function batchByIds<T>(
  ids: string[],
  batchSize: number,
  concurrency: number,
  worker: (batch: string[]) => Promise<T[]>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += batchSize) batches.push(unique.slice(i, i + batchSize));
  const out: T[] = [];
  for (let i = 0; i < batches.length; i += concurrency) {
    const wave = batches.slice(i, i + concurrency);
    const results = await Promise.all(wave.map(worker));
    for (const r of results) out.push(...r);
  }
  return out;
}

/** Static image URLs by asset hash — fallback when creative thumbnail_url is empty. */
async function fetchImageUrlsByHash(
  act: string,
  accessToken: string,
  hashes: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(hashes)];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    try {
      const res = await graphGet<{ data?: Array<{ hash?: string; url?: string }> }>(
        `${act}/adimages`,
        { hashes: JSON.stringify(batch), fields: 'hash,url' },
        accessToken,
      );
      for (const img of res.data ?? []) {
        if (img.hash && img.url) map.set(img.hash, img.url);
      }
    } catch {
      /* progressive enhancement */
    }
  }
  return map;
}

/** Video poster URLs — fallback for UGC / boosted posts when creative thumbnail is empty. */
async function fetchVideoPictures(accessToken: string, videoIds: string[]): Promise<Map<string, string>> {
  const results = await batchByIds<[string, string]>(
    videoIds,
    50,
    5,
    async (batch) => {
      try {
        const res = await graphGet<Record<string, { picture?: string }>>(
          '',
          { ids: batch.join(','), fields: 'picture' },
          accessToken,
        );
        return Object.entries(res)
          .filter(([, v]) => !!v?.picture)
          .map(([id, v]) => [id, v.picture as string] as [string, string]);
      } catch {
        return [];
      }
    },
  );
  return new Map(results);
}

interface RawAction {
  action_type: string;
  value: string;
}
interface RawInsightRow {
  ad_id: string;
  ad_name?: string;
  campaign_name?: string;
  adset_name?: string;
  objective?: string;
  country?: string;
  region?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: RawAction[];
  action_values?: RawAction[];
  video_play_actions?: RawAction[];
  video_thruplay_watched_actions?: RawAction[];
  video_avg_time_watched_actions?: RawAction[];
  video_p25_watched_actions?: RawAction[];
  video_p50_watched_actions?: RawAction[];
  video_p75_watched_actions?: RawAction[];
  video_p100_watched_actions?: RawAction[];
}

interface RawTextAsset {
  text?: string;
}
interface RawCreative {
  id?: string;
  object_type?: string;
  video_id?: string;
  image_hash?: string;
  thumbnail_url?: string;
  image_url?: string;
  instagram_permalink_url?: string;
  effective_instagram_media_id?: string;
  source_instagram_media_id?: string;
  object_story_spec?: {
    link_data?: { message?: string; name?: string; image_hash?: string };
    video_data?: { message?: string; title?: string; image_hash?: string };
  };
  asset_feed_spec?: {
    bodies?: RawTextAsset[];
    titles?: RawTextAsset[];
    images?: { hash?: string }[];
    videos?: { video_id?: string }[];
  };
}

/** Best-effort stable asset identity for de-duping a creative across ads. */
function extractAsset(creative: RawCreative | undefined): { videoId: string | null; imageHash: string | null } {
  const videoId =
    creative?.video_id ??
    creative?.asset_feed_spec?.videos?.find((v) => v.video_id)?.video_id ??
    null;
  const imageHash =
    creative?.image_hash ??
    creative?.object_story_spec?.link_data?.image_hash ??
    creative?.object_story_spec?.video_data?.image_hash ??
    creative?.asset_feed_spec?.images?.find((i) => i.hash)?.hash ??
    null;
  return { videoId, imageHash };
}

function extractCopy(creative: RawCreative | undefined): { primaryTexts: string[]; headlines: string[] } {
  const primary = new Set<string>();
  const heads = new Set<string>();
  const oss = creative?.object_story_spec;
  const add = (set: Set<string>, v?: string) => {
    const t = v?.trim();
    if (t) set.add(t);
  };
  add(primary, oss?.link_data?.message);
  add(primary, oss?.video_data?.message);
  add(heads, oss?.link_data?.name);
  add(heads, oss?.video_data?.title);
  for (const b of creative?.asset_feed_spec?.bodies ?? []) add(primary, b.text);
  for (const t of creative?.asset_feed_spec?.titles ?? []) add(heads, t.text);
  return { primaryTexts: [...primary], headlines: [...heads] };
}

const num = (v?: string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function firstAction(actions: RawAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  for (const t of types) {
    const hit = actions.find((a) => a.action_type === t);
    if (hit) return num(hit.value);
  }
  return 0;
}

function normalizeMetrics(i: RawInsightRow): BaseMetrics {
  const videoPlays = firstAction(i.video_play_actions, ['video_view']);
  const avgWatch = firstAction(i.video_avg_time_watched_actions, ['video_view']);
  return {
    spend: num(i.spend),
    impressions: num(i.impressions),
    reach: num(i.reach),
    clicks: num(i.clicks),
    linkClicks: firstAction(i.actions, ['link_click']),
    landingPageViews: firstAction(i.actions, ['landing_page_view', 'omni_landing_page_view']),
    purchases: firstAction(i.actions, ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']),
    purchaseValue: firstAction(i.action_values, ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']),
    registrations: firstAction(i.actions, ['omni_complete_registration', 'complete_registration', 'offsite_conversion.fb_pixel_complete_registration']),
    leads: firstAction(i.actions, ['lead', 'offsite_complete_registration_add_meta_leads']),
    addToCart: firstAction(i.actions, ['omni_add_to_cart', 'add_to_cart']),
    initiateCheckout: firstAction(i.actions, ['omni_initiated_checkout', 'initiate_checkout']),
    postEngagement: firstAction(i.actions, ['post_engagement']),
    reactions: firstAction(i.actions, ['post_reaction']),
    comments: firstAction(i.actions, ['comment']),
    shares: firstAction(i.actions, ['post']),
    saves: firstAction(i.actions, ['onsite_conversion.post_save']),
    videoPlays,
    video3s: videoPlays,
    thruplays: firstAction(i.video_thruplay_watched_actions, ['video_view']),
    videoWatchSeconds: avgWatch * videoPlays,
    p25: firstAction(i.video_p25_watched_actions, ['video_view']),
    p50: firstAction(i.video_p50_watched_actions, ['video_view']),
    p75: firstAction(i.video_p75_watched_actions, ['video_view']),
    p100: firstAction(i.video_p100_watched_actions, ['video_view']),
  };
}

const INSIGHTS_FIELDS = [
  'ad_id',
  'ad_name',
  'campaign_name',
  'adset_name',
  'objective',
  'spend',
  'impressions',
  'reach',
  'clicks',
  'actions',
  'action_values',
  'video_play_actions',
  'video_thruplay_watched_actions',
  'video_avg_time_watched_actions',
  'video_p25_watched_actions',
  'video_p50_watched_actions',
  'video_p75_watched_actions',
  'video_p100_watched_actions',
].join(',');

export type GeoBreakdown = 'country' | 'region';

export interface FetchOptions {
  datePreset?: string;
  since?: string;
  until?: string;
  /** When set, insights are split by geo so the same ad appears once per geo. */
  breakdown?: GeoBreakdown;
}

export async function fetchCreatives(opts: FetchOptions): Promise<CreativeResponse> {
  const { accessToken, accountId } = loadCredentials();
  const act = `act_${accountId}`;

  const accountRaw = await graphGet<{ name: string; currency: string; timezone_name?: string }>(
    act,
    { fields: 'name,currency,timezone_name' },
    accessToken,
  );
  const account: AccountInfo = {
    id: act,
    name: accountRaw.name,
    currency: accountRaw.currency,
    timezone: accountRaw.timezone_name ?? '',
  };

  // 1) Flat ad-level insights (only delivering ads appear here).
  const timeParams: GraphParams =
    opts.since && opts.until
      ? { time_range: JSON.stringify({ since: opts.since, until: opts.until }) }
      : { date_preset: opts.datePreset ?? 'last_14d' };
  const insights = await paginate<RawInsightRow>(
    `${act}/insights`,
    {
      level: 'ad',
      fields: INSIGHTS_FIELDS,
      limit: 500,
      ...(opts.breakdown ? { breakdowns: opts.breakdown } : {}),
      ...timeParams,
    },
    accessToken,
  );

  const rows: CreativeRow[] = insights.map((i) => ({
    adId: i.ad_id,
    adName: i.ad_name ?? '(unnamed)',
    status: 'UNKNOWN',
    campaignName: i.campaign_name ?? '(no campaign)',
    adsetName: i.adset_name ?? '(no ad set)',
    objective: i.objective ?? '',
    createdTime: null,
    creativeId: null,
    objectType: null,
    videoId: null,
    permalink: null,
    thumbnailUrl: null,
    imageHash: null,
    geo: opts.breakdown === 'region' ? i.region ?? null : i.country ?? null,
    primaryTexts: [],
    headlines: [],
    metrics: normalizeMetrics(i),
  }));

  // 2) Batch-fetch creative info by ad id.
  type AdInfo = { id: string; effective_status?: string; created_time?: string; creative?: RawCreative };
  const adInfos = await batchByIds<AdInfo>(
    rows.map((r) => r.adId),
    50,
    5,
    async (batch) => {
      try {
        const res = await graphGet<Record<string, AdInfo>>(
          '',
          {
            ids: batch.join(','),
            fields:
              'effective_status,created_time,creative{id,object_type,video_id,image_hash,thumbnail_url,image_url,instagram_permalink_url,effective_instagram_media_id,source_instagram_media_id,object_story_spec{link_data{message,name,image_hash},video_data{message,title,image_hash}},asset_feed_spec{bodies,titles,images,videos}}',
          },
          accessToken,
        );
        return Object.entries(res).map(([id, v]) => ({ ...v, id }));
      } catch {
        return [];
      }
    },
  );
  const adInfoById = new Map(adInfos.map((a) => [a.id, a]));
  for (const r of rows) {
    const info = adInfoById.get(r.adId);
    if (!info) continue;
    r.status = info.effective_status ?? 'UNKNOWN';
    r.createdTime = info.created_time ?? null;
    r.creativeId = info.creative?.id ?? null;
    r.objectType = info.creative?.object_type ?? null;
    r.permalink = info.creative?.instagram_permalink_url ?? null;
    const asset = extractAsset(info.creative);
    r.videoId = asset.videoId;
    r.imageHash = asset.imageHash;
    const copy = extractCopy(info.creative);
    r.primaryTexts = copy.primaryTexts;
    r.headlines = copy.headlines;
    // Full-size static asset URL when available. Avoid storing the nested
    // thumbnail_url here — Meta defaults to ~64px and looks blurry in the grid.
    r.thumbnailUrl = info.creative?.image_url ?? null;
  }

  // Low-res nested thumbnails — last-resort fallback if the high-res batch fails.
  const lowResByAd = new Map<string, string>();
  for (const r of rows) {
    const info = adInfoById.get(r.adId);
    const low = info?.creative?.thumbnail_url;
    if (low) lowResByAd.set(r.adId, low);
  }

  // 3) High-res thumbnails (600×600) for every creative — upgrades previews for
  // UGC/static/motion. Step 2 only seeds full image_url; this is the main source.
  const thumbResults = await batchByIds<[string, string]>(
    rows.map((r) => r.creativeId).filter((x): x is string => !!x),
    50,
    5,
    async (batch) => {
      try {
        const res = await graphGet<Record<string, { thumbnail_url?: string; image_url?: string }>>(
          '',
          { ids: batch.join(','), fields: 'thumbnail_url,image_url', thumbnail_width: 1080, thumbnail_height: 1080 },
          accessToken,
        );
        return Object.entries(res)
          .map(([id, v]) => [id, (v.thumbnail_url ?? v.image_url) as string | undefined] as [string, string | undefined])
          .filter(([, url]) => !!url)
          .map(([id, url]) => [id, url as string] as [string, string]);
      } catch {
        return [];
      }
    },
  );
  const thumbById = new Map(thumbResults);
  for (const r of rows) {
    if (!r.creativeId) continue;
    const hi = thumbById.get(r.creativeId);
    if (hi) r.thumbnailUrl = hi;
    else if (!r.thumbnailUrl) r.thumbnailUrl = lowResByAd.get(r.adId) ?? null;
  }

  // 4) Asset-level fallbacks — full-size static images + video posters.
  const imageHashes = [...new Set(rows.filter((r) => !r.thumbnailUrl && r.imageHash).map((r) => r.imageHash!))];
  const videoIds = [...new Set(rows.filter((r) => !r.thumbnailUrl && r.videoId).map((r) => r.videoId!))];
  const [imageUrlByHash, videoPictureById] = await Promise.all([
    imageHashes.length ? fetchImageUrlsByHash(act, accessToken, imageHashes) : Promise.resolve(new Map()),
    videoIds.length ? fetchVideoPictures(accessToken, videoIds) : Promise.resolve(new Map()),
  ]);
  for (const r of rows) {
    if (r.thumbnailUrl) continue;
    r.thumbnailUrl =
      (r.imageHash ? imageUrlByHash.get(r.imageHash) : undefined) ??
      (r.videoId ? videoPictureById.get(r.videoId) : undefined) ??
      lowResByAd.get(r.adId) ??
      null;
  }

  return {
    account,
    range: { label: opts.datePreset ?? 'custom', since: opts.since, until: opts.until },
    rows,
    fetchedAt: new Date().toISOString(),
  };
}
