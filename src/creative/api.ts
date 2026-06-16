/** Client for the local Meta creative API (served by the Vite dev middleware). */
import { emptyMetrics } from './types.ts';
import type { BaseMetrics, CreativeResponse, CreativeRow } from './types.ts';

/** Compact wire payload (see service.ts toWire) — rehydrated into CreativeRow[]. */
interface CreativeWire {
  account: CreativeResponse['account'];
  range: CreativeResponse['range'];
  fetchedAt: string;
  cached?: boolean;
  metricKeys: (keyof BaseMetrics)[];
  ads: Array<Omit<CreativeRow, 'geo' | 'metrics'>>;
  cells: Array<[number, string | null, ...number[]]>;
  error?: string;
}

function rehydrate(wire: CreativeWire): CreativeResponse {
  const rows: CreativeRow[] = wire.cells.map((cell) => {
    const [idx, geo, ...values] = cell;
    const ad = wire.ads[idx];
    const metrics = emptyMetrics();
    wire.metricKeys.forEach((k, i) => {
      metrics[k] = values[i] ?? 0;
    });
    // Older cached payloads predate createdTime; default it so the client type holds.
    return { ...ad, createdTime: ad.createdTime ?? null, geo, metrics };
  });
  return {
    account: wire.account,
    range: wire.range,
    rows,
    fetchedAt: wire.fetchedAt,
    cached: wire.cached,
  };
}

export interface DatePreset {
  id: string;
  label: string;
  /** Graph API date_preset value; undefined => custom range. */
  graph?: string;
}

export const DATE_PRESETS: DatePreset[] = [
  { id: 'last_7d', label: 'Last 7 days', graph: 'last_7d' },
  { id: 'last_14d', label: 'Last 14 days', graph: 'last_14d' },
  { id: 'last_30d', label: 'Last 30 days', graph: 'last_30d' },
  { id: 'last_90d', label: 'Last 90 days', graph: 'last_90d' },
  { id: 'this_month', label: 'This month', graph: 'this_month' },
  { id: 'last_month', label: 'Last month', graph: 'last_month' },
];

export interface DateSelection {
  presetId: string; // preset id or 'custom'
  since?: string;
  until?: string;
}

export type GeoBreakdown = 'country' | 'region';

export type PlatformId = 'meta' | 'tiktok' | 'snapchat' | 'reddit';

export interface PlatformStatus {
  id: PlatformId;
  label: string;
  configured: boolean;
  missing: string[];
}

/** Fetch which ad platforms are connected (for the platform switcher). */
export async function fetchPlatforms(): Promise<PlatformStatus[]> {
  const res = await fetch('/api/platforms');
  const json = (await res.json()) as { platforms?: PlatformStatus[]; error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json.platforms ?? [];
}

interface FetchOpts {
  refresh?: boolean;
  breakdown?: GeoBreakdown;
  /** Ad platform to pull from. Omitted => server defaults to Meta. */
  platform?: PlatformId;
}

/** Build the query params + a stable cache key (key excludes `refresh`). */
function buildRequest(sel: DateSelection, opts: FetchOpts): { params: URLSearchParams; key: string } {
  const params = new URLSearchParams();
  // Only send a platform param for non-Meta so Meta requests/cache keys stay
  // byte-identical to the pre-multi-platform behavior.
  if (opts.platform && opts.platform !== 'meta') params.set('platform', opts.platform);
  if (sel.presetId === 'custom' && sel.since && sel.until) {
    params.set('since', sel.since);
    params.set('until', sel.until);
  } else {
    const preset = DATE_PRESETS.find((p) => p.id === sel.presetId) ?? DATE_PRESETS[0];
    params.set('datePreset', preset.graph ?? 'last_7d');
  }
  if (opts.breakdown) params.set('breakdown', opts.breakdown);
  const key = params.toString();
  if (opts.refresh) params.set('refresh', '1');
  return { params, key };
}

interface CacheItem {
  at: number;
  data: CreativeResponse;
  /** In-flight request, so concurrent callers share one network round-trip. */
  inflight?: Promise<CreativeResponse>;
}

/** Session cache of fetched payloads, keyed by date range + geo breakdown. */
const clientCache = new Map<string, CacheItem>();

export interface CachedEntry {
  data: CreativeResponse;
  /** Epoch ms the payload was fetched; use to decide staleness. */
  at: number;
}

/** Synchronous lookup — returns a previously fetched payload without any network. */
export function peekCreatives(sel: DateSelection, opts: FetchOpts = {}): CachedEntry | undefined {
  const { key } = buildRequest(sel, opts);
  const hit = clientCache.get(key);
  return hit && hit.data ? { data: hit.data, at: hit.at } : undefined;
}

export async function fetchCreatives(sel: DateSelection, opts: FetchOpts = {}): Promise<CreativeResponse> {
  const { params, key } = buildRequest(sel, opts);

  // De-dupe concurrent requests for the same key (e.g. prefetch + user toggle).
  if (!opts.refresh) {
    const existing = clientCache.get(key);
    if (existing?.inflight) return existing.inflight;
  }

  const promise = (async () => {
    const res = await fetch(`/api/meta/creatives?${params.toString()}`);
    const json = (await res.json()) as CreativeWire;
    if (!res.ok || json.error) {
      throw new Error(json.error ?? `Request failed (${res.status})`);
    }
    const data = rehydrate(json);
    clientCache.set(key, { at: Date.now(), data });
    return data;
  })();

  const prev = clientCache.get(key);
  clientCache.set(key, { at: prev?.at ?? 0, data: prev?.data as CreativeResponse, inflight: promise });
  try {
    return await promise;
  } catch (err) {
    // Drop the failed in-flight marker but keep any prior good data.
    if (prev?.data) clientCache.set(key, { at: prev.at, data: prev.data });
    else clientCache.delete(key);
    throw err;
  }
}
