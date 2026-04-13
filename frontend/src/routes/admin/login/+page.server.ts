import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { adminLoginSchema } from '$lib/validation/auth';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  // If already authenticated as an Admin
  if (locals.user?.role === 'admin') {
    throw redirect(303, resolve('/admin'));
  }

  const form = await superValidate(zod4(adminLoginSchema));

  return { form };
};

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const form = await superValidate(request, zod4(adminLoginSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      const response = await auth.api.signInEmail({
        body: {
          email: form.data.email,
          password: form.data.password,
        },
        asResponse: true,
        headers: request.headers,
      });

      forwardAuthCookies(response, cookies);

      if (!response.ok) {
        return message(form, 'Identifiants invalides ou accès refusé.', {
          status: 400,
        });
      }

      // Verify the authenticated user actually has the admin role
      const user = await prisma.bauth_user.findUnique({
        where: { email: form.data.email },
        select: { role: true },
      });

      if (user?.role !== 'admin') {
        cookies.delete('better-auth.session_token', { path: '/' });
        cookies.delete('better-auth.session_data', { path: '/' });
        return message(form, 'Identifiants invalides ou accès refusé.', {
          status: 400,
        });
      }
    } catch (err) {
      console.error('Admin login error:', err);
      return message(form, 'Identifiants invalides ou accès refusé.', {
        status: 400,
      });
    }

    throw redirect(303, resolve('/admin'));
  },
};
