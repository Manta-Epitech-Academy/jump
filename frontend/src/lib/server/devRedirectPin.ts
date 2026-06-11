import type { RequestEvent } from '@sveltejs/kit';
import { outboundTrapped } from '$lib/server/outbound';
import { parseCookieToken, signCookieToken } from '$lib/server/signedCookie';

/**
 * Dev-redirect pin — a runtime way to test the *logged-out* OTP login flow.
 *
 * The dev-redirect trap routes a trapped send to the human driving the request
 * (the request actor in `requestContext`). But a regular OTP login (a talent or
 * parent typing their email at `/login`) runs with **no session**, so there is
 * no actor and the login mail falls to the shared `EMAIL_DEV_RECIPIENTS` list.
 * That makes it impossible for a tester to reliably receive the code in their
 * own inbox.
 *
 * The pin closes that gap: an admin arms it from the settings dialog, logs out,
 * and triggers the OTP flow — `hooks.server.ts` then resolves this cookie and
 * makes the pinned admin *look like* the request actor, so the existing routing
 * ladder sends the login mail to their personal list (or login email). It lives
 * in a signed cookie in the tester's **own browser**, so two admins testing the
 * same staging env each route to themselves with no collision.
 *
 * Reuses the `armRealSends` cookie shape (signed via `signedCookie`,
 * auto-expiring, admin-gated) with one deliberate difference:
 *
 *   `armRealSends` verifies the cookie's `userId` against the *live*
 *   `effectiveUserId(locals)` — a gun-safety property, since arming may lift the
 *   trap and must only ever affect a human actively driving a session.
 *
 *   The pin does the opposite: it is consulted ONLY when there is no session
 *   (see `hooks.server.ts`) and trusts the signed `userId` embedded in the
 *   cookie. That relaxation is safe because the pin grants *zero* power beyond
 *   choosing a redirect destination *inside* the trap — it can never lift the
 *   trap to reach a real recipient (that still requires prod or armed real
 *   sends). The cookie was minted by an admin-gated action and is HMAC-signed,
 *   so the worst a forged/stale pin could do is land a trapped copy in some
 *   admin's inbox.
 */
export const DEV_REDIRECT_PIN_COOKIE = 'dev_redirect_pin';

/**
 * How long a pin lasts before it auto-clears. Roomier than the 15-min arm: the
 * pin is benign (it never reaches a real recipient), and testing a login flow a
 * few times wants a little breathing room.
 */
export const DEV_REDIRECT_PIN_MS = 30 * 60 * 1000;

/** Build the signed cookie value. See `signedCookie` for the token format. */
export function makePinCookie(expiresAt: number, userId: string): string {
  return signCookieToken(expiresAt, userId);
}

/**
 * Resolve the pinned tester from the signed cookie, or null. Inert off a
 * trapped env. Unlike `readArmedState`, this does NOT match against
 * `locals.user` — the pin exists for logged-out requests, where there is none.
 * Returns the bound `userId` (the caller resolves the staff record from it) and
 * the auto-clear deadline.
 */
export function readDevRedirectPin(
  event: RequestEvent,
): { userId: string; until: Date } | null {
  if (!outboundTrapped()) return null;
  const parsed = parseCookieToken(event.cookies.get(DEV_REDIRECT_PIN_COOKIE));
  if (!parsed) return null;
  return { userId: parsed.userId, until: new Date(parsed.expiresAt) };
}
