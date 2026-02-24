import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { adminLoginSchema } from '$lib/validation/auth';

export const load: PageServerLoad = async ({ locals }) => {
	const adminPb = locals.adminPb;
	const userPb = locals.userPb;

	// If already authenticated as an Admin
	if (adminPb?.authStore.isValid) {
		throw redirect(303, resolve('/admin'));
	}

	// If already authenticated as a regular Staff member
	if (userPb?.authStore.isValid) {
		throw redirect(303, resolve('/'));
	}

	const form = await superValidate(zod4(adminLoginSchema));

	return {
		form
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(adminLoginSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			// Authenticate against the PocketBase system collection dedicated to admins
			await locals.pb.collection('_superusers').authWithPassword(
				form.data.email,
				form.data.password
			);
		} catch (err) {
			console.error('Admin login error:', err);
			// Do not provide specific error details (wrong email or password) for security reasons
			return message(form, 'Identifiants invalides ou accès refusé.', { status: 400 });
		}

		// Redirect to the admin dashboard on successful login
		throw redirect(303, resolve('/admin'));
	}
};
