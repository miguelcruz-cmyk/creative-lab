/**
 * Optional app password gate — shared by the edge middleware and /api/auth.
 *
 * This open-source build ships with NO password. The gate is entirely opt-in:
 * set an `APP_PASSWORD` environment variable on your deployment (and in local
 * `.env`) to require a shared password before the app loads. Leave it unset to
 * run the app open (fine for local dev or a single-user deployment).
 *
 * The password itself is never stored in code — only the running process reads
 * `APP_PASSWORD`. Rotating it (or removing it) takes effect on the next deploy
 * and invalidates existing sessions.
 */

/** Message signed into the session cookie; bump the version to force re-login. */
export const SESSION_MESSAGE = 'creative-lab-session-v1';

export const SESSION_COOKIE = 'creative_lab_session';
