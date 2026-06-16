/**
 * Shared request handler for the creative API. Used by both the Vite dev
 * middleware (local) and the Vercel Function (production), so there is one
 * source of truth for query parsing + caching.
 *
 * The in-memory cache lives per process/instance. On Vercel with Fluid Compute
 * a warm instance reuses it; cold starts recompute. For a shared, durable cache
 * across instances, swap this Map for Vercel KV / Upstash (see README).
 */
import { METRIC_KEYS, type CreativeResponse, type GeoBreakdown } from './metaApi.js';
import { getSnapshot, setSnapshot, storeKind, type Snapshot } from './store.js';
import { getAdapter } from '../platforms/registry.js';
import { isPlatformId, type PlatformId } from '../platforms/types.js';

export interface CreativeQuery {
  /** Ad platform to pull from. Defaults to 'meta' for backward compatibility. */
  platform?: PlatformId;
  datePreset?: string;
  since?: string;
  until?: string;
  breakdown?: GeoBreakdown;
  refresh?: boolean;
}

/**
 * Compact wire format. Ad/creative metadata is sent once per ad (not repeated
 * across every geo row), and metrics are encoded as fixed-order numeric arrays
 * keyed by `metricKeys`. This keeps geo-broken-down payloads (which can be
 * ~10k rows) well under Vercel's ~4.5MB serverless response limit. The client
 * rehydrates these into the usual CreativeRow[] shape.
 */
export interface CreativeWire {
  account: CreativeResponse['account'];
  range: CreativeResponse['range'];
  fetchedAt: string;
  cached: boolean;
  metricKeys: string[];
  ads: Array<{
    adId: string;
    adName: string;
    status: string;
    campaignName: string;
    adsetName: string;
    objective: string;
    createdTime: string | null;
    creativeId: string | null;
    objectType: string | null;
    videoId: string | null;
    imageHash: string | null;
    permalink: string | null;
    thumbnailUrl: string | null;
    primaryTexts: string[];
    headlines: string[];
  }>;
  /** [adIndex, geo, ...metric values in metricKeys order] */
  cells: Array<[number, string | null, ...number[]]>;
}

export interface ServiceResult {
  status: number;
  body: CreativeWire | { error: string };
}

/** Round to 4 decimals to trim float noise from the wire without losing accuracy. */
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function toWire(data: CreativeResponse, cached: boolean): CreativeWire {
  const adIndex = new Map<string, number>();
  const ads: CreativeWire['ads'] = [];
  const cells: CreativeWire['cells'] = [];
  for (const row of data.rows) {
    let idx = adIndex.get(row.adId);
    if (idx === undefined) {
      idx = ads.length;
      adIndex.set(row.adId, idx);
      ads.push({
        adId: row.adId,
        adName: row.adName,
        status: row.status,
        campaignName: row.campaignName,
        adsetName: row.adsetName,
        objective: row.objective,
        createdTime: row.createdTime,
        creativeId: row.creativeId,
        objectType: row.objectType,
        videoId: row.videoId,
        imageHash: row.imageHash,
        permalink: row.permalink,
        thumbnailUrl: row.thumbnailUrl,
        primaryTexts: row.primaryTexts,
        headlines: row.headlines,
      });
    }
    cells.push([idx, row.geo, ...METRIC_KEYS.map((k) => r4(row.metrics[k]))]);
  }
  return {
    account: data.account,
    range: data.range,
    fetchedAt: data.fetchedAt,
    cached,
    metricKeys: METRIC_KEYS as string[],
    ads,
    cells,
  };
}

/** Snapshots within this age are tagged FRESH in logs; older ones STALE. The
 *  user path serves snapshots regardless of age, so this is informational only.
 *  Kept just past the 12h cron cadence so normal snapshots read as fresh. */
const FRESH_MS = 13 * 60 * 60 * 1000;

/** Date presets the cron warmer keeps hot in the store (account totals only —
 *  geo breakdowns stay on-demand). */
export const WARM_PRESETS = ['last_7d', 'last_14d', 'last_30d', 'last_90d'];

export function cacheKey(query: CreativeQuery): string {
  const platform = query.platform ?? 'meta';
  const base =
    query.since && query.until
      ? `range:${query.since}:${query.until}`
      : `preset:${query.datePreset ?? 'last_14d'}`;
  // Meta keys stay unprefixed so snapshots written before multi-platform stay
  // valid; only other platforms namespace their keys. The version segment is
  // bumped when an adapter's payload gains fields (e.g. Snap thumbnails in v2)
  // so stale pre-upgrade snapshots are ignored instead of served forever.
  const prefix = platform === 'meta' ? 'v4|' : `plat:${platform}:v2|`;
  return `${prefix}${base}|geo:${query.breakdown ?? 'none'}`;
}

export function parseQuery(params: URLSearchParams): CreativeQuery {
  const breakdown = params.get('breakdown');
  const platform = params.get('platform');
  return {
    platform: isPlatformId(platform) ? platform : undefined,
    datePreset: params.get('datePreset') ?? undefined,
    since: params.get('since') ?? undefined,
    until: params.get('until') ?? undefined,
    breakdown: breakdown === 'country' || breakdown === 'region' ? breakdown : undefined,
    refresh: params.get('refresh') === '1',
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Global serialize-and-space gate. EVERY Meta pull (cron warmer, cold misses,
// manual refresh) runs through here, so at most one full pull happens at a time
// and consecutive pulls are spaced apart. This makes a burst against the
// ad-account impossible regardless of how the call was triggered.
const MIN_GAP_MS = 1500;
let gate: Promise<unknown> = Promise.resolve();

function gated<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(fn, fn); // run once the previous pull settles
  // Hold the gate open for a spacing delay after each pull settles.
  gate = run.then(
    () => sleep(MIN_GAP_MS),
    () => sleep(MIN_GAP_MS),
  );
  return run;
}

// Single-flight: collapse concurrent pulls for the same key (within a warm
// instance) into one Meta request so simultaneous users don't each hit Meta.
const inFlight = new Map<string, Promise<CreativeResponse>>();

function pull(query: CreativeQuery, key: string): Promise<CreativeResponse> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = gated(async () => {
    const adapter = getAdapter(query.platform ?? 'meta');
    const data = await adapter.fetchCreatives({
      datePreset: query.datePreset,
      since: query.since,
      until: query.until,
      breakdown: query.breakdown,
    });
    await setSnapshot(key, { at: Date.now(), data });
    return data;
  });
  inFlight.set(key, p);
  // Clear the slot once settled (whether it resolved or threw).
  void p.finally(() => {
    if (inFlight.get(key) === p) inFlight.delete(key);
  });
  return p;
}

export async function getCreatives(query: CreativeQuery): Promise<ServiceResult> {
  const key = cacheKey(query);
  const snap = await getSnapshot(key);

  // Serve whatever the store has, regardless of age — the cron warmer is the
  // only thing that refreshes snapshots, so normal browsing never calls Meta.
  // (We don't need live data; freshness is the sync cadence.)
  if (!query.refresh && snap) {
    const age = Date.now() - snap.at;
    const wire = toWire(snap.data, true);
    const tag = age < FRESH_MS ? 'FRESH' : 'STALE';
    console.log(`[creatives] key=${key} store=${tag}(${storeKind}) age=${age}ms cells=${wire.cells.length}`);
    return { status: 200, body: wire };
  }

  // Only a cold miss (nothing in the store yet) or an explicit refresh reaches
  // Meta — and only through the serialized gate.
  const started = Date.now();
  try {
    const data = await pull(query, key);
    const wire = toWire(data, false);
    console.log(
      `[creatives] key=${key} store=MISS(${storeKind}) ads=${wire.ads.length} cells=${wire.cells.length} bytes=${JSON.stringify(wire).length} ms=${Date.now() - started}`,
    );
    return { status: 200, body: wire };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    // Rate-limited or Meta is down — serve the last good snapshot (even if
    // stale) instead of erroring the user out.
    if (snap) {
      console.warn(`[creatives] key=${key} pull failed (${msg}); serving stale age=${Date.now() - snap.at}ms`);
      return { status: 200, body: toWire(snap.data, true) };
    }
    console.error(`[creatives] key=${key} ERROR ms=${Date.now() - started} msg=${msg}`);
    return { status: 500, body: { error: msg } };
  }
}

/**
 * Force-refresh one query into the store. Used by the cron warmer; bypasses the
 * freshness check but still rides single-flight + persistence.
 */
export async function syncCreatives(query: CreativeQuery): Promise<Snapshot> {
  const key = cacheKey(query);
  const data = await pull(query, key);
  return { at: Date.now(), data };
}
