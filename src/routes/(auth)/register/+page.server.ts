import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { registerSchema } from '$lib/validation/auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.pb.authStore.isValid) {
		throw redirect(302, '/');
	}
	const form = await superValidate(zod4(registerSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(registerSchema));
		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await locals.pb.collection('users').create({
				username: form.data.username,
				email: form.data.email,
				emailVisibility: true,
				password: form.data.password,
				passwordConfirm: form.data.passwordConfirm
			});

			await locals.pb.collection('users').authWithPassword(form.data.email, form.data.password);

			return message(form, 'Inscription réussie, redirection…');
		} catch (err: unknown) {
			return message(form, 'Erreur lors de l’inscription', { status: 400 });
		}
	}
};
