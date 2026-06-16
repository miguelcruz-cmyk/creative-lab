/**
 * Durable snapshot store for creative pulls.
 *
 * The goal is to decouple browser traffic from Meta's Graph API: snapshots are
 * written by the cron warmer (and on-demand fetches) and read by the API on the
 * user path, so browsing/refreshing/cold-starts never each trigger their own
 * live pull against the ad account.
 *
 * Backends:
 *   - Redis (Vercel Redis / Upstash) when a connection URL is present in the
 *     env. This is shared across every serverless instance and survives
 *     deploys, so it is the reliable production backend.
 *   - In-memory Map fallback otherwise (local dev, or before a store is
 *     provisioned). Per-process and wiped on deploy — fine as a soft cache.
 */
import { Redis } from 'ioredis';
import type { CreativeResponse } from './metaApi.js';

export interface Snapshot {
  /** ms epoch when the underlying Meta pull completed. */
  at: number;
  data: CreativeResponse;
}

/** How long a snapshot lives in the store (well beyond the sync cadence so a
 *  lapsed cron still leaves something to serve stale). */
const TTL_SECONDS = 48 * 60 * 60;

const REDIS_URL =
  process.env.REDIS_URL ??
  process.env.KV_URL ??
  process.env.UPSTASH_REDIS_URL ??
  '';

export const storeKind: 'redis' | 'memory' = REDIS_URL ? 'redis' : 'memory';

const PREFIX = 'creatives:v1:';

const memory = new Map<string, unknown>();

// Reused across invocations on a warm instance. Lazy so dev/no-Redis paths
// never open a connection.
let client: Redis | null = null;
function redis(): Redis {
  if (!client) {
    client = new Redis(REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
    });
    client.on('error', (err) => console.error(`[store] redis error: ${err.message}`));
  }
  return client;
}

/** Generic JSON get — shared by creative snapshots and any other durable
 *  values so everything rides one backend. */
export async function getValue<T>(key: string): Promise<T | null> {
  if (storeKind === 'memory') return (memory.get(key) as T | undefined) ?? null;
  try {
    const result = await redis().get(PREFIX + key);
    return result ? (JSON.parse(result) as T) : null;
  } catch (err) {
    console.error(`[store] get failed key=${key} err=${(err as Error).message}`);
    return null;
  }
}

/** Generic JSON set with TTL (defaults to the snapshot TTL). */
export async function setValue<T>(key: string, value: T, ttlSeconds = TTL_SECONDS): Promise<void> {
  if (storeKind === 'memory') {
    memory.set(key, value);
    return;
  }
  try {
    await redis().set(PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    console.error(`[store] set failed key=${key} err=${(err as Error).message}`);
  }
}

export async function getSnapshot(key: string): Promise<Snapshot | null> {
  return getValue<Snapshot>(key);
}

export async function setSnapshot(key: string, snap: Snapshot): Promise<void> {
  await setValue(key, snap);
}
