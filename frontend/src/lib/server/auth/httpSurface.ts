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
 * **A served route takes the body Jump's client sends, and no more.** The
 * Microsoft sign-in accepts far more than the login page asks for, and the
 * rest undid what `server/auth.ts` pins: `scopes` is appended to the
 * configured ones, so a caller asking for `offline_access` was handed a refresh
 * token again, stored in `bauth_account`; `idToken` signs in with a token
 * minted elsewhere, a flow Jump never offers (security audit run-1). A key
 * outside the list is refused with a 400, before BetterAuth reads the body.
 *
 * `onRequest` runs on HTTP requests only, never on `auth.api.*`, and ahead of
 * routing, after BetterAuth's per-IP limiter. That limiter therefore sees the
 * refused requests too, which costs nothing: no legitimate caller sends one.
 */
const MOUNTED: Record<string, ReadonlySet<string> | null> = {
  // What `authClient.signIn.social` sends from `/staff/login`, with the keys
  // the client may fill in itself.
  '/sign-in/social': new Set([
    'provider',
    'callbackURL',
    'errorCallbackURL',
    'newUserCallbackURL',
    'disableRedirect',
  ]),
  // Microsoft's return, a GET carrying its answer in the query.
  '/callback/microsoft': null,
};

export function httpSurface(): BetterAuthPlugin {
  return {
    id: 'jump-http-surface',
    async onRequest(request, ctx) {
      // The same base the router strips, read the way it reads it.
      const basePath = new URL(ctx.baseURL).pathname.replace(/\/+$/, '');
      const { pathname } = new URL(request.url);
      const path = Object.keys(MOUNTED).find(
        (path) => pathname === `${basePath}${path}`,
      );
      if (!path) return { response: new Response(null, { status: 404 }) };

      const accepted = MOUNTED[path];
      if (accepted && !(await bodyWithin(request, accepted))) {
        return { response: new Response(null, { status: 400 }) };
      }
    },
  };
}

/**
 * Whether a JSON body names only `accepted` keys. A body that is no JSON
 * object passes: BetterAuth's own validation refuses it, with its own answer.
 */
async function bodyWithin(request: Request, accepted: ReadonlySet<string>) {
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return true;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return true;
  }
  return Object.keys(body).every((key) => accepted.has(key));
}
