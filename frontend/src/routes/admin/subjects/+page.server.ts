import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { subjectSchema } from '$lib/validation/subjects';
import { SubjectsDifficulteOptions } from '$lib/pocketbase-types';

export const load: PageServerLoad = async ({ locals }) => {
	// Load ONLY official subjects and themes (campus = "" or null)
	const subjects = await locals.pb.collection('subjects').getFullList({
		filter: 'campus = "" || campus = null',
		sort: '-created',
		expand: 'themes'
	});

	const themes = await locals.pb.collection('themes').getFullList({
		filter: 'campus = "" || campus = null',
		sort: 'nom'
	});

	const form = await superValidate(zod4(subjectSchema));

	return { subjects, themes, form };
};

// Strict global creation logic for themes
async function processOfficialThemes(pb: App.Locals['pb'], themeNames: string[]) {
	const themeIds: string[] = [];
	for (const name of themeNames) {
		if (!name.trim()) continue;
		try {
			// Look for an existing official theme
			const existing = await pb.collection('themes').getFirstListItem(`nom = "${name.replace(/"/g, '\\"')}" && (campus = "" || campus = null)`);
			themeIds.push(existing.id);
		} catch {
			// Create a new OFFICIAL theme (without a campus)
			const created = await pb.collection('themes').create({ nom: name, campus: null });
			themeIds.push(created.id);
		}
	}
	return themeIds;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(subjectSchema));
		if (!form.valid) return fail(400, { form });

		try {
			const themeIds = await processOfficialThemes(locals.pb, form.data.themes);

			// Creation via the standard API, without injecting a campus
			await locals.pb.collection('subjects').create({
				...form.data,
				difficulte: form.data.difficulte as SubjectsDifficulteOptions,
				themes: themeIds,
				campus: null
			});

			return message(form, 'Sujet officiel publié !');
		} catch (err) {
			console.error(err);
			return message(form, 'Erreur lors de la création', { status: 500 });
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const form = await superValidate(formData, zod4(subjectSchema));
		const id = formData.get('id') as string;

		if (!form.valid || !id) return fail(400, { form });

		try {
			const themeIds = await processOfficialThemes(locals.pb, form.data.themes);
			await locals.pb.collection('subjects').update(id, {
				...form.data,
				difficulte: form.data.difficulte as SubjectsDifficulteOptions,
				themes: themeIds
			});
			return message(form, 'Sujet officiel mis à jour !');
		} catch (err) {
			return message(form, 'Erreur lors de la modification', { status: 500 });
		}
	},

	delete: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);

    try {
      // SECURITY : Check if the subject is present in at least one participation
			const usedInParticipations = await locals.pb.collection('participations').getList(1, 1, {
				filter: `subjects ~ "${id}"`,
				requestKey: null
			});

			if (usedInParticipations.totalItems > 0) {
				return fail(400, {
					message: "Suppression bloquée : Ce sujet a déjà été utilisé lors d'événements. Le supprimer corromprait l'historique d'XP des élèves."
				});
			}

			await locals.pb.collection('subjects').delete(id);
			return { success: true };
		} catch (err) {
			return fail(500, { message: 'Erreur lors de la suppression.' });
		}
	}
};
