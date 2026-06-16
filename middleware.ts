/**
 * Vercel Edge Middleware — OPTIONAL app-level password gate.
 *
 * The gate is opt-in: it only activates when an `APP_PASSWORD` environment
 * variable is set on the deployment. When `APP_PASSWORD` is unset, every
 * request passes through untouched (good for local dev / single-user setups).
 *
 * When `APP_PASSWORD` is set, every request (pages, assets, and APIs) requires
 * a valid session cookie. Visitors without one get an inline login page; APIs
 * return 401 JSON. Machine paths stay reachable without a browser session:
 *   - /api/auth            the login endpoint itself
 *   - /api/cron/*          Vercel Cron (handler validates CRON_SECRET / x-vercel-cron)
 *   - any request carrying `Authorization: Bearer $CRON_SECRET`
 *
 * The session cookie is an HMAC keyed by the SHA-256 of the password, so
 * changing or removing `APP_PASSWORD` invalidates every existing session.
 */
import { next } from '@vercel/edge';
import { SESSION_COOKIE, SESSION_MESSAGE } from './auth-config.js';

export const config = { matcher: '/(.*)' };

const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

async function sessionToken(hash: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(hash), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(SESSION_MESSAGE)));
}

export default async function middleware(req: Request): Promise<Response> {
  const password = process.env.APP_PASSWORD;
  // Gate disabled: no password configured, so the app is open.
  if (!password) return next();

  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/api/auth' || path.startsWith('/api/cron/')) return next();

  const cronSecret = process.env.CRON_SECRET;
  const bearer = req.headers.get('authorization');
  if (cronSecret && bearer === `Bearer ${cronSecret}`) return next();

  const hash = toHex(await crypto.subtle.digest('SHA-256', enc.encode(password)));
  const cookieToken = (req.headers.get('cookie') ?? '').match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`),
  )?.[1];
  if (cookieToken && cookieToken === (await sessionToken(hash))) return next();

  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  return new Response(loginPage(url.searchParams.has('denied')), {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Self-contained login page in the tool's visual language (no asset deps). */
function loginPage(denied: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Creative Lab — Sign in</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body {
    min-height: 100vh; display: grid; place-items: center;
    background: oklch(12% 0.01 275); color: oklch(96% 0.006 275);
    font: 400 14px/1.5 'Manrope', ui-sans-serif, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .card { width: min(360px, calc(100vw - 48px)); border: 1px solid oklch(24% 0.01 275); border-radius: 8px; background: oklch(16% 0.01 275); padding: 28px; }
  .kicker { font: 600 10px/1 'SF Mono', ui-monospace, monospace; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(62% 0.014 275); margin-bottom: 14px; }
  h1 { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 4px; }
  p { font-size: 12.5px; color: oklch(62% 0.014 275); margin-bottom: 20px; }
  input {
    width: 100%; height: 40px; padding: 0 12px; border-radius: 6px;
    border: 1px solid oklch(24% 0.01 275); background: oklch(12% 0.01 275);
    color: inherit; font: inherit; outline: none;
  }
  input:focus { border-color: oklch(62% 0.014 275); }
  button {
    width: 100%; height: 40px; margin-top: 10px; border: 0; border-radius: 6px;
    background: oklch(96% 0.006 275); color: oklch(12% 0.01 275);
    font: 600 13px 'Manrope', ui-sans-serif, system-ui, sans-serif; cursor: pointer;
  }
  button:hover { opacity: 0.85; }
  .err { font: 500 11px 'SF Mono', ui-monospace, monospace; color: oklch(78% 0.15 25); margin-top: 12px; }
</style>
</head>
<body>
  <main class="card">
    <div class="kicker">creative lab</div>
    <h1>Access</h1>
    <p>This deployment is password protected. Enter the shared password.</p>
    <form method="POST" action="/api/auth">
      <input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password" />
      <button type="submit">Enter →</button>
    </form>
    ${denied ? '<div class="err">wrong password — try again</div>' : ''}
  </main>
</body>
</html>`;
}
