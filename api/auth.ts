/**
 * POST /api/auth — exchanges the shared password for a session cookie.
 *
 * Only relevant when the optional gate is enabled (an `APP_PASSWORD` env var is
 * set). When no password is configured the app is open and this endpoint simply
 * redirects home. The cookie value is HMAC-SHA256 keyed by the SHA-256 of the
 * password — the same derivation the edge middleware checks. Stateless:
 * rotating/removing the password invalidates all sessions at once.
 */
import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SESSION_COOKIE, SESSION_MESSAGE } from '../auth-config.js';

const MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function suppliedPassword(req: VercelRequest): string {
  const raw = req.body as unknown;
  if (typeof raw === 'string') {
    try {
      return String((JSON.parse(raw) as { password?: string }).password ?? '');
    } catch {
      return String(new URLSearchParams(raw).get('password') ?? '');
    }
  }
  if (raw && typeof raw === 'object') return String((raw as { password?: string }).password ?? '');
  return '';
}

export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const password = process.env.APP_PASSWORD;
  // No gate configured — nothing to authenticate.
  if (!password) {
    res.redirect(302, '/');
    return;
  }

  const hash = crypto.createHash('sha256').update(password).digest('hex');
  const supplied = suppliedPassword(req);
  const suppliedHash = crypto.createHash('sha256').update(supplied).digest();
  const ok = supplied.length > 0 && crypto.timingSafeEqual(suppliedHash, Buffer.from(hash, 'hex'));
  if (!ok) {
    res.redirect(302, '/?denied=1');
    return;
  }

  const token = crypto.createHmac('sha256', hash).update(SESSION_MESSAGE).digest('hex');
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`,
  );
  res.redirect(302, '/');
}
