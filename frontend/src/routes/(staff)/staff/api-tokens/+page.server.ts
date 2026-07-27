import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { requireAdminSession } from '$lib/server/auth/guards';
import { mintToken, revokeToken } from '$lib/server/adminApi/tokens';
import { createApiTokenSchema } from '$lib/validation/adminApiToken';

// Action-only route, exactly like `/staff/settings`: the UI is a dialog rendered
// by the admin layout (API tokens are an admin-only control), so a direct GET has
// no page to render and bounces to the admin space.
export const load: PageServerLoad = async () => {
  throw redirect(303, '/staff/admin');
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    requireAdminSession(locals);
    const userId = locals.user?.id;
    if (!userId) throw redirect(303, '/staff/login');

    const form = await superValidate(request, zod4(createApiTokenSchema));
    if (!form.valid) return fail(400, { form });

    const token = await mintToken(userId, form.data.label);

    // The plaintext secret travels back exactly once, in this response, and is
    // never stored in that form. The dialog shows it until it is dismissed.
    return message(form, {
      type: 'created' as const,
      label: token.label,
      secret: token.secret,
    });
  },

  revoke: async ({ url, locals }) => {
    requireAdminSession(locals);
    const userId = locals.user?.id;
    if (!userId) throw redirect(303, '/staff/login');

    // id arrives as an action query param (?/revoke&id=…) because the shared
    // ConfirmDeleteDialog renders no hidden field.
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    // Scoped to the owner inside the service: an id from someone else's list is
    // simply not a valid target here.
    const result = await revokeToken(id, userId);
    if (!result.ok) {
      return fail(404, {
        message: 'Ce token est introuvable ou déjà révoqué.',
      });
    }
    return { success: true };
  },
};
