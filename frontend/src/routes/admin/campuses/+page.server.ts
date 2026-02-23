import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';

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
      // SECURITY : Checkk if the campus is used before deleting
			const [studentsUsed, eventsUsed, staffUsed] = await Promise.all([
				locals.pb.collection('students').getList(1, 1, { filter: `campus = "${id}"`, requestKey: null }),
				locals.pb.collection('events').getList(1, 1, { filter: `campus = "${id}"`, requestKey: null }),
				locals.pb.collection('users').getList(1, 1, { filter: `campus = "${id}"`, requestKey: null })
			]);

			if (studentsUsed.totalItems > 0 || eventsUsed.totalItems > 0 || staffUsed.totalItems > 0) {
				return fail(400, {
					message: `Suppression impossible : Ce campus contient ${studentsUsed.totalItems} élèves, ${eventsUsed.totalItems} événements et ${staffUsed.totalItems} membres du staff.`
				});
			}

			await locals.pb.collection('campuses').delete(id);
			return { success: true };
		} catch (err) {
			return fail(500, { message: 'Erreur lors de la suppression.' });
		}
	}
};
