/**
 * Vercel Function: GET /api/platforms
 *
 * Lists every known ad platform and whether it's configured (has credentials),
 * so the UI can render a platform switcher and disable the ones that still need
 * setup. Never exposes secret values — only which env var names are missing.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { platformStatuses } from '../scripts/platforms/registry.js';

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ platforms: platformStatuses() });
}
