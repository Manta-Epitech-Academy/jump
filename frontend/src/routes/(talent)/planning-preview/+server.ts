import { error, json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
  TALENT_PLANNING_PREVIEW_COOKIE,
  isPlanningPreview,
  isTalentImpersonation,
} from '$lib/server/talentPlanningPreview';
import type { RequestHandler } from './$types';

// Cookie spans the whole talent portal (the dashboard lives at the group root),
// so it survives navigation while the admin previews. The reader re-validates
// the impersonation gate, so a wide path can't widen who the preview reaches.
const COOKIE_PATH = '/';
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8h, long enough for a working session

/**
 * Sets or clears the talent planning-preview cookie. Gated to admin sessions
 * impersonating a talent; the reader (`hooks.server.ts`) re-validates, but we
 * refuse to even write the cookie when the gate fails.
 *
 * Returns a small JSON payload so the caller can `fetch()` + `invalidateAll()`
 * without a full-page navigation, matching the dev phase-override endpoint
 * (this route lives outside any page, so `use:enhance` can't be used).
 */
export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  if (!isTalentImpersonation(locals)) {
    throw error(403, 'Aperçu réservé aux sessions admin impersonifiées.');
  }

  const form = await request.formData();
  const raw = String(form.get('value') ?? '');

  if (raw === '') {
    cookies.delete(TALENT_PLANNING_PREVIEW_COOKIE, { path: COOKIE_PATH });
    return json({ preview: null });
  }

  if (!isPlanningPreview(raw)) {
    throw error(400, "Valeur d'aperçu invalide.");
  }

  cookies.set(TALENT_PLANNING_PREVIEW_COOKIE, raw, {
    path: COOKIE_PATH,
    httpOnly: true,
    secure: !dev,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
  });
  return json({ preview: raw });
};
