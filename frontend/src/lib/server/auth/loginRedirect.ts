import type { Cookies } from '@sveltejs/kit';

/**
 * "Login redirect": when a guard bounces an unauthenticated talent/staff to the
 * login page, the page they were trying to reach (path + query) is carried as
 * `?redirect=` and replayed after a successful login.
 *
 * The visible `?redirect=` query is the entry point; a short-lived cookie then
 * carries the target through the multi-step login (the staff OAuth round-trip
 * and the two-step talent OTP both lose page query state), and the success
 * handlers consume it.
 */
export const REDIRECT_PARAM = 'redirect';
export const REDIRECT_COOKIE = 'post_login_redirect';
const COOKIE_MAX_AGE = 10 * 60; // 10 minutes — long enough to log in, short enough to not linger.

// Paths we never bounce back to: returning here after login would loop or be
// meaningless.
function isReturnablePath(pathname: string): boolean {
  return !(
    pathname === '/login' ||
    pathname === '/staff/login' ||
    pathname.startsWith('/logout') ||
    pathname.startsWith('/api/') ||
    pathname.includes('/oauth')
  );
}

/**
 * Validate that a raw value is a safe, same-origin path. Rejects absolute URLs,
 * protocol-relative (`//host`), backslash tricks, control chars / CRLF and any
 * embedded scheme — i.e. anything that could turn into an open redirect.
 * Returns the (decoded) path, query and hash preserved, or null.
 */
export function safeRedirectTarget(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  // Validate the value as-is. Callers always pass an already-decoded path
  // (`searchParams.get` and `cookies.get` decode once); do NOT decode again
  // here or an encoded query value like `%20` would be corrupted on replay.
  const value = raw;
  if (value.length > 2000) return null;
  if (!value.startsWith('/')) return null; // must be a local path
  if (value.startsWith('//') || value.startsWith('/\\')) return null; // //host or /\host
  if (value.includes('://')) return null; // a scheme snuck in
  if (/[\u0000-\u001f]/.test(value)) return null; // control chars / CRLF
  const pathname = value.split('?')[0].split('#')[0];
  if (!isReturnablePath(pathname)) return null;
  return value;
}

/**
 * Build a login URL carrying the current location as `?redirect=` so login
 * success can replay it. Returns the bare login path when the location isn't
 * worth returning to (e.g. it IS a login/auth page).
 */
export function loginUrlWithRedirect(loginPath: string, url: URL): string {
  const target = url.pathname + url.search;
  if (!safeRedirectTarget(target)) return loginPath;
  return `${loginPath}?${REDIRECT_PARAM}=${encodeURIComponent(target)}`;
}

/**
 * On the login page load, persist the `?redirect=` target into a short-lived
 * cookie so it survives the multi-step login. No-op when the param is absent or
 * unsafe.
 */
export function captureRedirectCookie(url: URL, cookies: Cookies): void {
  const target = safeRedirectTarget(url.searchParams.get(REDIRECT_PARAM));
  if (!target) return;
  cookies.set(REDIRECT_COOKIE, target, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * Read + clear the redirect cookie, returning a validated target (or null).
 * Use on success paths that redirect via SvelteKit's `redirect()` / `cookies`.
 */
export function consumeRedirectCookie(cookies: Cookies): string | null {
  const raw = cookies.get(REDIRECT_COOKIE);
  if (raw) cookies.delete(REDIRECT_COOKIE, { path: '/' });
  return safeRedirectTarget(raw);
}

/**
 * `Set-Cookie` value that clears the redirect cookie — for success paths that
 * return a raw `Response` and can't use the `cookies` API (e.g. the staff OAuth
 * callback, which sets its own cookie header).
 */
export function clearRedirectCookieHeader(): string {
  return `${REDIRECT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
