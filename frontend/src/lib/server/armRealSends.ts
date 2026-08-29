import type { RequestEvent } from '@sveltejs/kit';
import { can } from '$lib/domain/permissions';
import { outboundTrapped } from '$lib/server/outbound';
import { parseCookieToken, signCookieToken } from '$lib/server/signedCookie';

/**
 * "Real sends" arming: the gun safety for outbound on a trapped env.
 *
 * The env var stays the immutable *gate* ("is this environment trapped at
 * all"), because it survives DB restores: a `pg_dump` from prod into staging
 * can't carry a "send for real" flag across the boundary the way a DB row
 * would. On top of that gate, an authorized human can deliberately *arm* real
 * sends for a short window, lifting the redirect so their own sends reach real
 * recipients (testing a real broadcast / onboarding mail from staging).
 *
 * Three properties make this safe rather than a loaded gun left on the table:
 *   - **per-user**: the armed state lives in a signed cookie bound to the
 *     arming user's id, so it can never make someone else's session (or a
 *     background cron, which has no cookie) send for real;
 *   - **auto-expiring**: it lapses after `ARM_REAL_SENDS_MS`, re-engaging the
 *     safety on its own;
 *   - **role-gated + loud**: only `realSendArmers` can arm, and a red banner
 *     shows everywhere while armed (see the root layout).
 *
 * The cookie is HMAC-signed with `BETTER_AUTH_SECRET` (via `signedCookie`) so it
 * can't be forged in devtools to bypass the role gate.
 */
export const ARM_REAL_SENDS_COOKIE = 'armed_real_sends';

/** How long an arm lasts before it auto-disarms. */
export const ARM_REAL_SENDS_MS = 15 * 60 * 1000;

/** Build the signed cookie value. See `signedCookie` for the token format. */
export function makeArmCookie(expiresAt: number, userId: string): string {
  return signCookieToken(expiresAt, userId);
}

/** Effective staff role of the human driving the request (impersonator wins). */
function effectiveStaffRole(locals: App.Locals) {
  return (
    locals.impersonator?.staffRole ?? locals.staffProfile?.staffRole ?? null
  );
}

/**
 * User id of the human driving the request: the impersonator when staff
 * impersonate someone, otherwise the logged-in user. The arm binds to *this*,
 * not `locals.user.id`, which is the whole point: an admin who arms and then
 * impersonates a talent has their session swapped to the talent
 * (`locals.user.id` becomes the talent's), but the human (and the arm) is
 * still the admin. Binding to `locals.user.id` would silently disarm on the
 * exact path the feature exists for. Mirrors `effectiveStaffRole`'s
 * impersonator-wins rule so the role gate and the identity binding stay in
 * lockstep.
 */
export function effectiveUserId(locals: App.Locals): string | null {
  return locals.impersonator?.userId ?? locals.user?.id ?? null;
}

/** May the current human arm real sends? Only on a trapped env, leads + admin. */
export function canArmRealSends(locals: App.Locals): boolean {
  return outboundTrapped() && can('realSendArmers', effectiveStaffRole(locals));
}

/**
 * Resolve the armed state for this request from the signed cookie. Inert
 * (never armed) in prod, and only honored for the human the cookie is bound to
 * (impersonator-aware, see `effectiveUserId`), so a stale or copied cookie
 * can't arm a different session, and an admin's arm carries across the swap
 * into an impersonated talent's session.
 */
export function readArmedState(event: RequestEvent): {
  armed: boolean;
  until: Date | null;
} {
  if (!outboundTrapped()) return { armed: false, until: null };
  const parsed = parseCookieToken(event.cookies.get(ARM_REAL_SENDS_COOKIE));
  const humanId = effectiveUserId(event.locals);
  if (!parsed || !humanId || parsed.userId !== humanId) {
    return { armed: false, until: null };
  }
  return { armed: true, until: new Date(parsed.expiresAt) };
}
