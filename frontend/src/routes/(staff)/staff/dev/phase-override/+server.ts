import { error, json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
  DEV_PHASE_OVERRIDE_COOKIE,
  isDevImpersonation,
  isDevPhaseOverride,
} from '$lib/server/devPhaseOverride';
import type { RequestHandler } from './$types';

const COOKIE_PATH = '/staff/dev';
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8h, long enough for a working session

/**
 * Sets or clears the dev phase-override cookie. Gated to admin-impersonating
 * sessions targeting a dev/superdev account; readers (`hooks.server.ts`)
 * re-validate, but we refuse to even write the cookie when the gate fails.
 *
 * Returns a small JSON payload so the caller can `fetch()` + `invalidateAll()`
 * without a full-page navigation. We deliberately avoid SvelteKit's form-action
 * + `use:enhance` flow because this endpoint lives outside any page route.
 */
export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  if (!isDevImpersonation(locals)) {
    throw error(403, 'Override réservé aux sessions admin impersonifiées.');
  }

  const form = await request.formData();
  const raw = String(form.get('value') ?? '');

  if (raw === '') {
    cookies.delete(DEV_PHASE_OVERRIDE_COOKIE, { path: COOKIE_PATH });
    return json({ override: null });
  }

  if (!isDevPhaseOverride(raw)) {
    throw error(400, 'Valeur de phase invalide.');
  }

  cookies.set(DEV_PHASE_OVERRIDE_COOKIE, raw, {
    path: COOKIE_PATH,
    httpOnly: true,
    secure: !dev,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
  });
  return json({ override: raw });
};
