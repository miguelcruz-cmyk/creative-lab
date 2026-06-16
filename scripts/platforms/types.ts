/**
 * Multi-platform ad data foundation.
 *
 * Every ad platform (Meta, TikTok, Snapchat, Reddit, …) is exposed through one
 * contract: pull its native reporting + creative data and normalize it into the
 * shared `CreativeResponse` shape (flat, *additive* `BaseMetrics` rows). Once an
 * adapter returns that shape, it automatically inherits everything the rest of
 * the app already does on top of it — store-first caching, the cron warmer,
 * de-duping, formats, and the UI grids.
 *
 * The shared domain types live in the Meta layer today (it was the first
 * platform); they are platform-neutral, so adapters import them from there
 * rather than duplicating the shapes.
 */
import type { CreativeResponse, FetchOptions } from '../meta-creative-api/metaApi.js';

export type { CreativeResponse, FetchOptions };

export type PlatformId = 'meta' | 'tiktok' | 'snapchat' | 'reddit';

export const PLATFORM_IDS: PlatformId[] = ['meta', 'tiktok', 'snapchat', 'reddit'];

export function isPlatformId(value: string | null | undefined): value is PlatformId {
  return value === 'meta' || value === 'tiktok' || value === 'snapchat' || value === 'reddit';
}

export interface PlatformAdapter {
  /** Stable id used in query params, cache keys, and the store. */
  id: PlatformId;
  /** Display name for the UI. */
  label: string;
  /**
   * Env var names this adapter needs to be considered "configured". Surfaced in
   * the platforms endpoint and error messages so it's obvious what's missing.
   */
  requiredEnv: string[];
  /** True when every required env var is present (non-empty). */
  isConfigured(): boolean;
  /** Pull + normalize creatives into the shared CreativeResponse shape. */
  fetchCreatives(opts: FetchOptions): Promise<CreativeResponse>;
}

/** Thrown when an adapter is asked to fetch but its credentials are not set. */
export class PlatformNotConfiguredError extends Error {
  readonly platform: PlatformId;
  readonly missing: string[];
  constructor(platform: PlatformId, missing: string[]) {
    super(
      `${platform} is not configured. Set the following environment variable(s): ${missing.join(', ')}.`,
    );
    this.name = 'PlatformNotConfiguredError';
    this.platform = platform;
    this.missing = missing;
  }
}

/** Helper: which of an adapter's required env vars are missing/empty. */
export function missingEnv(requiredEnv: string[]): string[] {
  return requiredEnv.filter((name) => !process.env[name]?.trim());
}
