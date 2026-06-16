/**
 * Vercel Cron: GET /api/cron/sync
 *
 * Warms the common date presets into the durable store on a fixed schedule (see
 * vercel.json `crons`). Because the user-facing API reads store-first, this is
 * the *only* path that regularly calls Meta — so total Graph API volume is
 * fixed and predictable regardless of how many people browse or refresh.
 *
 * Pulls run sequentially with spacing to stay gentle on the ad-account's rate
 * limit. Protected by CRON_SECRET: Vercel sends `Authorization: Bearer
 * $CRON_SECRET` on scheduled invocations when that env var is set.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { syncCreatives, WARM_PRESETS } from '../../scripts/meta-creative-api/service.js';
import { configuredPlatformIds } from '../../scripts/platforms/registry.js';

const SPACING_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization ?? '';
    const isVercelCron = req.headers['x-vercel-cron'] !== undefined;
    if (auth !== `Bearer ${secret}` && !isVercelCron) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const results: Array<{ platform: string; preset: string; ok: boolean; rows?: number; ms?: number; error?: string }> = [];
  // Warm every configured platform. Within a platform, stop on the first error
  // (usually a rate/budget limit) but still move on to the next platform.
  for (const platform of configuredPlatformIds()) {
    for (const preset of WARM_PRESETS) {
      const started = Date.now();
      try {
        const snap = await syncCreatives({ platform, datePreset: preset });
        results.push({ platform, preset, ok: true, rows: snap.data.rows.length, ms: Date.now() - started });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        results.push({ platform, preset, ok: false, ms: Date.now() - started, error });
        break;
      }
      await sleep(SPACING_MS);
    }
  }

  const ok = results.every((r) => r.ok);
  console.log(`[cron/sync] ${JSON.stringify(results)}`);
  res.status(ok ? 200 : 207).json({ ok, syncedAt: new Date().toISOString(), results });
}
