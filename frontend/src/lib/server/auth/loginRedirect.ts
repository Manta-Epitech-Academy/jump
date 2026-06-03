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
 *
 * One cookie is shared by both flows and a logged-out user can edit it, so the
 * target is validated twice: `safeRedirectTarget` blocks open redirects, and
 * the `LoginAudience` check stops a target captured by one flow (or forged in
 * the cookie) from replaying into the other, which would land the user outside
 * their space only for the route guards to bounce them straight back.
 */
const REDIRECT_PARAM = 'redirect';
const REDIRECT_COOKIE = 'post_login_redirect';
const COOKIE_MAX_AGE = 10 * 60; // 10 minutes: long enough to log in, short enough to not linger.

/** The two login flows that replay a redirect target after a successful login. */
export type LoginAudience = 'staff' | 'talent';

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

function pathnameOf(value: string): string {
  return value.split('?')[0].split('#')[0];
}

/**
 * Which space a path belongs to, by top-level route group. `parent` is a real
 * space but never replays a redirect (parents have fixed destinations), so a
 * parent target matches neither login flow and is always dropped.
 */
function spaceOf(pathname: string): LoginAudience | 'parent' {
  if (pathname === '/staff' || pathname.startsWith('/staff/')) return 'staff';
  if (pathname === '/parent' || pathname.startsWith('/parent/'))
    return 'parent';
  return 'talent';
}

/**
 * Validate that a raw value is a safe, same-origin path. Rejects absolute URLs,
 * protocol-relative (`//host`), backslash tricks, control chars / CRLF and any
 * embedded scheme, i.e. anything that could turn into an open redirect. Returns
 * the value unchanged (path, query and hash preserved), or null.
 */
function safeRedirectTarget(raw: string | null | undefined): string | null {
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
  if (!isReturnablePath(pathnameOf(value))) return null;
  return value;
}

/**
 * A redirect target valid for a specific login flow: a safe same-origin path
 * (open-redirect hardening) that also belongs to that flow's space. Every
 * capture/consume boundary goes through this single gate.
 */
function redirectTargetFor(
  raw: string | null | undefined,
  audience: LoginAudience,
): string | null {
  const value = safeRedirectTarget(raw);
  if (!value) return null;
  return spaceOf(pathnameOf(value)) === audience ? value : null;
}

/**
 * Build a login URL carrying the current location as `?redirect=` so login
 * success can replay it. Returns the bare login path when the location isn't
 * worth returning to (e.g. it IS a login/auth page). The guard only ever
 * bounces a path from the login's own space, so the open-redirect check alone
 * is enough here.
 */
export function loginUrlWithRedirect(loginPath: string, url: URL): string {
  const target = url.pathname + url.search;
  if (!safeRedirectTarget(target)) return loginPath;
  return `${loginPath}?${REDIRECT_PARAM}=${encodeURIComponent(target)}`;
}

/**
 * On the login page load, persist the `?redirect=` target into a short-lived
 * cookie so it survives the multi-step login. Clears the cookie when the param
 * is absent, unsafe, or for another space, so a stale target from an abandoned
 * (or other-flow) attempt can never linger and replay.
 */
export function captureRedirectCookie(
  url: URL,
  cookies: Cookies,
  audience: LoginAudience,
): void {
  const target = redirectTargetFor(
    url.searchParams.get(REDIRECT_PARAM),
    audience,
  );
  if (!target) {
    cookies.delete(REDIRECT_COOKIE, { path: '/' });
    return;
  }
  cookies.set(REDIRECT_COOKIE, target, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * Read + clear the redirect cookie, returning a target valid for this flow (or
 * null). The cleared cookie is applied to both `throw redirect()` and raw
 * `Response` returns, since SvelteKit merges `cookies` mutations into either.
 */
export function consumeRedirectCookie(
  cookies: Cookies,
  audience: LoginAudience,
): string | null {
  const raw = cookies.get(REDIRECT_COOKIE);
  if (raw) cookies.delete(REDIRECT_COOKIE, { path: '/' });
  return redirectTargetFor(raw, audience);
}
