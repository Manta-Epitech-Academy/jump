import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';

const themeSchema = z.object({
	nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').trim()
});

export const load: PageServerLoad = async ({ locals }) => {
	// Load only global themes (empty or null campus)
	const themes = await locals.pb.collection('themes').getFullList({
		filter: 'campus = "" || campus = null',
		sort: 'nom'
	});

	const form = await superValidate(zod4(themeSchema));

	return { themes, form };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(themeSchema));
		if (!form.valid) return fail(400, { form });

		try {
			// Creation via the standard API to enforce a null campus (Official Theme)
			await locals.pb.collection('themes').create({
				nom: form.data.nom,
				campus: null
			});
			return message(form, 'Thème officiel créé.');
		} catch (err) {
			console.error(err);
			return message(form, 'Erreur lors de la création du thème.', { status: 500 });
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const form = await superValidate(formData, zod4(themeSchema));
		const id = formData.get('id') as string;

		if (!form.valid || !id) return fail(400, { form });

		try {
			await locals.pb.collection('themes').update(id, { nom: form.data.nom });
			return message(form, 'Thème mis à jour.');
		} catch (err) {
			return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
		}
	},

	delete: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);

    try {
			// SECURITY : Check if the theme is used in a subject or an event
			const [usedInSubjects, usedInEvents] = await Promise.all([
				locals.pb.collection('subjects').getList(1, 1, { filter: `themes ~ "${id}"`, requestKey: null }),
				locals.pb.collection('events').getList(1, 1, { filter: `theme = "${id}"`, requestKey: null })
			]);

			if (usedInSubjects.totalItems > 0 || usedInEvents.totalItems > 0) {
				return fail(400, {
					message: `Suppression bloquée : Ce thème est utilisé par ${usedInSubjects.totalItems} sujet(s) et ${usedInEvents.totalItems} événement(s).`
				});
			}

			await locals.pb.collection('themes').delete(id);
			return { success: true };
		} catch (err) {
			return fail(500, { message: 'Erreur lors de la suppression.' });
		}
	}
};
