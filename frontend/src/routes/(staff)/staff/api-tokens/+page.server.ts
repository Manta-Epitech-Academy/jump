import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { requireAdminSession } from '$lib/server/auth/guards';
import { mintToken, revokeToken } from '$lib/server/adminApi/tokens';
import { createApiTokenSchema } from '$lib/validation/adminApiToken';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

// Action-only route, exactly like `/staff/settings`: the UI is a dialog rendered
// by the admin layout (API tokens are an admin-only control), so a direct GET has
// no page to render and bounces to the admin space.
export const load: PageServerLoad = async () => {
  throw redirect(303, '/staff/admin');
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
    // never stored in that form. The dialog shows it until it is dismissed.
    return message(form, {
      type: 'created' as const,
      label: token.label,
      secret: token.secret,
    });
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
