import type { BetterAuthPlugin } from 'better-auth';

/**
 * Serve BetterAuth over HTTP for the staff door alone.
 *
 * Jump drives every other flow through `auth.api.*` on the server: the OTP
 * sign-in, the session read in `hooks.server.ts`, logout, impersonation. The
 * browser's own client calls exactly two routes, the Microsoft sign-in and the
 * callback it returns to. Everything else BetterAuth mounts was a second door
 * beside the one Jump guards:
 * - the email-OTP routes, unauthenticated beside `/login`, which the per-email
 *   ledger in `./rateLimiter` never saw (100 codes mailed to one talent in a
 *   minute, from one address);
 * - the admin routes, which an admin session could call to impersonate a
 *   guardian with no audit row, or to set `bauth_user.role` without the
 *   `StaffProfile` it pairs with;
 * - the core account, user and session routes, which act on `session.user`,
 *   the target of an impersonation: an admin acting as a member of staff read
 *   their stored Microsoft tokens (`get-access-token`), renamed them, and signed
 *   them out everywhere, none of it audited.
 *
 * **An allowlist, not `disabledPaths`.** BetterAuth's own option is a denylist,
 * and a denylist goes stale on the next release: the audit's proposed list had
 * already missed `delete-user` and `change-email`. Here a route a release adds
 * is closed on arrival, core or plugin.
 *
 * **Exact pathnames, compared raw.** The router matches the undecoded
 * pathname, so a spelling this comparison does not recognise (a trailing
 * slash, `%2D`, upper case) is refused rather than reasoned about. The only
 * mistake left to make is in the list itself.
 *
 * `onRequest` runs on HTTP requests only, never on `auth.api.*`, and ahead of
 * routing, after BetterAuth's per-IP limiter. That limiter therefore sees the
 * refused requests too, which costs nothing: no legitimate caller sends one.
 */
const MOUNTED_PATHS = ['/sign-in/social', '/callback/microsoft'];

export function httpSurface(): BetterAuthPlugin {
  return {
    id: 'jump-http-surface',
    async onRequest(request, ctx) {
      // The same base the router strips, read the way it reads it.
      const basePath = new URL(ctx.baseURL).pathname.replace(/\/+$/, '');
      const { pathname } = new URL(request.url);
      if (MOUNTED_PATHS.some((path) => pathname === `${basePath}${path}`)) {
        return;
      }
      return { response: new Response(null, { status: 404 }) };
    },
  };
}
