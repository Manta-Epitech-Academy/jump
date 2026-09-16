/**
 * Minting and revoking the curated admin API's bearer tokens.
 *
 * This used to be an action-only route redirecting on GET, because the UI was a
 * dialog rendered by the admin layout. It is a page now (issue #357), and the
 * move is what fixes the defect rather than a presentation preference: the
 * secret travels back exactly once, and a dialog is the worst place in this app
 * to hold a value that cannot be fetched again.
 *
 * Three things follow from being a page, and each removed one of the conditions
 * the lost-secret bug needed:
 *
 *   - the form posts to its own route, so there is no cross-route action and no
 *     `invalidateAll` fired at the whole app to refresh a list next to it;
 *   - the secret is read off SvelteKit's own `form` prop in `+page.svelte`,
 *     never copied into component state, so nothing re-rendering can drop it;
 *   - it is not rendered inside a portal that mounts its children in a separate
 *     component tree.
 */

import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { requireAdminSession } from '$lib/server/auth/guards';
import {
  listTokens,
  mintToken,
  revokeToken,
} from '$lib/server/adminApi/tokens';
import { createApiTokenSchema } from '$lib/validation/adminApiToken';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

export const load: PageServerLoad = async ({ url }) => {
  return {
    form: await superValidate(zod4(createApiTokenSchema)),
    // Every admin's tokens, not just this one's: see `listTokens`. Streamed, so
    // the page paints its form and its connection instructions without waiting
    // on a count nothing above the fold needs.
    tokens: listTokens(),
    // The commands on this page name this environment, not a documented
    // example: a token minted on preprod pasted against prod is a confusing
    // 401, and an origin read from the request cannot drift from where the
    // person actually is.
    origin: url.origin,
  };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_API_TOKEN_MINT, { locals });
    requireAdminSession(locals);
    const userId = locals.user?.id;
    if (!userId) throw redirect(303, '/staff/login');

    const form = await superValidate(request, zod4(createApiTokenSchema));
    if (!form.valid) return fail(400, { form });

    const token = await mintToken(userId, {
      label: form.data.label,
      tier: form.data.tier,
      writeEnabled: form.data.writeEnabled,
    });

    // The plaintext secret travels back exactly once, in this response, and is
    // never stored in that form. It rides beside `form` rather than inside
    // superforms' `message` on purpose: SvelteKit puts the whole returned object
    // on `page.form`, which the page reads directly, and which no load re-run
    // can clear. Only a navigation can, which is the semantics wanted here.
    return {
      form,
      created: { label: token.label, secret: token.secret },
    };
  },

  revoke: async ({ url, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_API_TOKEN_REVOKE, { locals });
    requireAdminSession(locals);
    const userId = locals.user?.id;
    if (!userId) throw redirect(303, '/staff/login');

    // id arrives as an action query param (?/revoke&id=…) because the shared
    // ConfirmDeleteDialog renders no hidden field.
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    // Any admin may cut any token, including one they did not mint (the holder
    // of a leadership token has no Jump account and no way to cut it himself).
    // The actor is stamped on the row, so the act stays attributable.
    const result = await revokeToken(id, userId);
    if (!result.ok) {
      return fail(404, {
        message: 'Ce token est introuvable ou déjà révoqué.',
      });
    }
    return { success: true };
  },
};
