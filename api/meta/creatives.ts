/**
 * Vercel Function: GET /api/meta/creatives
 *
 * Production counterpart to the Vite dev middleware. Reads ACCESS_TOKEN and
 * AD_ACCOUNT_ID from Vercel environment variables (never shipped to the client)
 * and returns normalized creative rows. Shares all logic with local dev via
 * scripts/meta-creative-api/service.ts.
 *
 * A full pull makes many Graph calls and can take ~30-50s, so this runs on the
 * Node runtime with an elevated maxDuration (see vercel.json).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCreatives, parseQuery } from '../../scripts/meta-creative-api/service.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost');
  const query = parseQuery(url.searchParams);
  const result = await getCreatives(query);

  // Cache successful, non-refresh payloads at the Vercel edge so cold starts and
  // teammates reuse a cached response instead of re-pulling from Meta. SWR lets
  // the edge serve stale instantly while it revalidates in the background.
  if (result.status === 200 && !query.refresh) {
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.status(result.status).json(result.body);
}
