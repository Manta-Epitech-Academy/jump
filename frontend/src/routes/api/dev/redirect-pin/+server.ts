import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { canArmRealSends, effectiveUserId } from '$lib/server/armRealSends';
import {
  DEV_REDIRECT_PIN_COOKIE,
  DEV_REDIRECT_PIN_MS,
  makePinCookie,
} from '$lib/server/devRedirectPin';

/**
 * Arm / disarm the dev-redirect pin on a trapped (dev/staging) env — route
 * trapped login (OTP) mail to the arming admin so they can test the real
 * logged-out login flow. See `$lib/server/devRedirectPin`.
 *
 * Lives under `/api` (not behind `/staff/*` guards) for the same reason as
 * `/api/dev/real-sends`: the disarm button rides the global banner, which is
 * shown on logged-out pages too — the whole point is to arm, then log out and
 * test. So **disarm carries no auth**: clearing your own cookie is harmless,
 * and the actor is logged out by design. **Arm** is admin-gated (reuses the
 * `realSendArmers` group via `canArmRealSends`), since minting a pin is only
 * meaningful for a logged-in admin.
 *
 * Submitted as a plain same-origin form (`action=arm|disarm`); redirects back
 * to the page it was posted from so the banner updates in place.
 */
export const POST: RequestHandler = async ({
  request,
  locals,
  cookies,
  url,
}) => {
  const data = await request.formData();
  const action = data.get('action');

  if (action === 'disarm') {
    cookies.delete(DEV_REDIRECT_PIN_COOKIE, { path: '/' });
  } else if (action === 'arm') {
    if (!locals.user) throw error(401, 'Non autorisé.');
    if (!canArmRealSends(locals)) throw error(403, 'Action réservée.');
    const humanId = effectiveUserId(locals);
    if (!humanId) throw error(401, 'Non autorisé.');

    const expiresAt = Date.now() + DEV_REDIRECT_PIN_MS;
    cookies.set(DEV_REDIRECT_PIN_COOKIE, makePinCookie(expiresAt, humanId), {
      path: '/',
      httpOnly: true,
      secure: !dev,
      sameSite: 'lax',
      maxAge: Math.ceil(DEV_REDIRECT_PIN_MS / 1000),
    });
  } else {
    throw error(400, 'Action inconnue.');
  }

  // Return to the submitting page, same-origin only (no open redirect).
  let back = '/staff/admin';
  const ref = request.headers.get('referer');
  if (ref) {
    try {
      const u = new URL(ref);
      if (u.origin === url.origin) back = u.pathname + u.search;
    } catch {
      // ignore a malformed referer, fall back to the admin space
    }
  }
  throw redirect(303, back);
};
