import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { ClientResponseError } from 'pocketbase';

const campusSchema = z.object({
	name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').trim()
});

export const load: PageServerLoad = async ({ locals }) => {
	// Fetch all campuses ordered by name
	const campuses = await locals.pb.collection('campuses').getFullList({
		sort: 'name'
	});

	const form = await superValidate(zod4(campusSchema));

	return { campuses, form };
};

export const actions: Actions = {
	// Create a new campus
	create: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(campusSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await locals.pb.collection('campuses').create(form.data);
			return message(form, 'Campus créé avec succès.');
		} catch (err) {
			console.error(err);
			return message(form, 'Erreur lors de la création du campus.', { status: 500 });
		}
	},

	// Update an existing campus by its ID
	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const form = await superValidate(formData, zod4(campusSchema));
		const id = formData.get('id') as string;

		if (!form.valid || !id) return fail(400, { form });

		try {
			await locals.pb.collection('campuses').update(id, form.data);
			return message(form, 'Campus mis à jour.');
		} catch (err) {
			return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
		}
	},

	// Delete a campus and prevent deletion if linked to external data
	delete: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);

		try {
			await locals.pb.collection('campuses').delete(id);
			return { success: true };
		} catch (err) {
			if (err instanceof ClientResponseError && err.status === 400) {
				return fail(400, {
					message: 'Impossible de supprimer ce campus car il est lié à des données (Élèves, Events).'
				});
			}
			return fail(500, { message: 'Erreur lors de la suppression.' });
		}
	}
};
