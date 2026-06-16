/**
 * Central registry of ad-platform adapters. Everything platform-aware (the
 * service layer, cron warmer, the platforms endpoint) goes through here
 * so adding a platform is just: implement the adapter + register it.
 */
import { metaAdapter } from './meta.js';
import { tiktokAdapter } from './tiktok.js';
import { snapchatAdapter } from './snapchat.js';
import { redditAdapter } from './reddit.js';
import { PLATFORM_IDS, type PlatformAdapter, type PlatformId } from './types.js';

export const ADAPTERS: Record<PlatformId, PlatformAdapter> = {
  meta: metaAdapter,
  tiktok: tiktokAdapter,
  snapchat: snapchatAdapter,
  reddit: redditAdapter,
};

export function getAdapter(id: PlatformId): PlatformAdapter {
  return ADAPTERS[id];
}

export interface PlatformStatus {
  id: PlatformId;
  label: string;
  configured: boolean;
  /** Env vars still missing (empty when configured). */
  missing: string[];
}

/** Status of every known platform — drives the UI selector + setup docs. */
export function platformStatuses(): PlatformStatus[] {
  return PLATFORM_IDS.map((id) => {
    const a = ADAPTERS[id];
    return {
      id: a.id,
      label: a.label,
      configured: a.isConfigured(),
      missing: a.requiredEnv.filter((name) => !process.env[name]?.trim()),
    };
  });
}

/** Just the platforms that currently have credentials (used by the cron warmer). */
export function configuredPlatformIds(): PlatformId[] {
  return PLATFORM_IDS.filter((id) => ADAPTERS[id].isConfigured());
}
