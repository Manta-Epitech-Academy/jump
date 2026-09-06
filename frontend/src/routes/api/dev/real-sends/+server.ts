import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
  ARM_REAL_SENDS_COOKIE,
  ARM_REAL_SENDS_MS,
  canArmRealSends,
  effectiveUserId,
  makeArmCookie,
} from '$lib/server/armRealSends';

/**
 * Arm / disarm "real sends" on a trapped (dev/staging) env. Lives under `/api`
 * so it's reachable from anywhere, including the global banner on a page the
 * armer reached while impersonating a talent (the `/staff/*` guards would
 * bounce that session). Authorization is enforced here, not by a route guard.
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
  if (!locals.user) throw error(401, 'Non autorisé.');
  if (!canArmRealSends(locals)) throw error(403, 'Action réservée.');

  // Bind the arm to the human driving the request (impersonator wins), so it
  // survives an admin starting impersonation after arming: `locals.user` then
  // becomes the talent, but the arm stays the admin's. See `effectiveUserId`.
  const humanId = effectiveUserId(locals);
  if (!humanId) throw error(401, 'Non autorisé.');

  const data = await request.formData();
  const action = data.get('action');

  if (action === 'arm') {
    const expiresAt = Date.now() + ARM_REAL_SENDS_MS;
    cookies.set(ARM_REAL_SENDS_COOKIE, makeArmCookie(expiresAt, humanId), {
      path: '/',
      httpOnly: true,
      secure: !dev,
      sameSite: 'lax',
      maxAge: Math.ceil(ARM_REAL_SENDS_MS / 1000),
    });
  } else if (action === 'disarm') {
    cookies.delete(ARM_REAL_SENDS_COOKIE, { path: '/' });
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
