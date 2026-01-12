import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { activitySchema } from '$lib/validation/activities';
import { ClientResponseError } from 'pocketbase';

export const load: PageServerLoad = async ({ locals }) => {
	const activities = await locals.pb.collection('activities').getFullList({
		sort: '-created',
		expand: 'themes'
	});

	const themes = await locals.pb.collection('themes').getFullList({
		sort: 'nom'
	});

	const form = await superValidate(zod4(activitySchema));

	return {
		activities,
		themes,
		form
	};
};

/**
 * Helper to convert a list of Theme Names (strings) into Theme IDs.
 * Creates the theme if it doesn't exist.
 */
async function processThemes(pb: App.Locals['pb'], themeNames: string[]) {
	const themeIds: string[] = [];

	for (const name of themeNames) {
		if (!name.trim()) continue;

		// 1. Check if exists
		try {
			const existing = await pb
				.collection('themes')
				.getFirstListItem(`nom = "${name.replace(/"/g, '\\"')}"`);
			themeIds.push(existing.id);
		} catch (e) {
			// 2. If not, create
			const created = await pb.collection('themes').create({ nom: name });
			themeIds.push(created.id);
		}
	}
	return themeIds;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(activitySchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const themeIds = await processThemes(locals.pb, form.data.themes);

			await locals.pb.collection('activities').create({
				...form.data,
				themes: themeIds
			});

			return message(form, 'Activité créée avec succès !');
		} catch (err) {
			console.error('Erreur création activité:', err);
			return message(form, 'Erreur lors de la création', { status: 500 });
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const form = await superValidate(formData, zod4(activitySchema));
		const id = formData.get('id') as string;

		if (!form.valid) {
			return fail(400, { form });
		}

		if (!id) {
			return message(form, 'ID activité manquant', { status: 400 });
		}

		try {
			const themeIds = await processThemes(locals.pb, form.data.themes);

			await locals.pb.collection('activities').update(id, {
				...form.data,
				themes: themeIds
			});

			return message(form, 'Activité mise à jour avec succès !');
		} catch (err) {
			console.error('Erreur update activité:', err);
			return message(form, 'Erreur lors de la modification', { status: 500 });
		}
	},

	delete: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);

		try {
			await locals.pb.collection('activities').delete(id);
			return { success: true };
		} catch (err) {
			console.error('Erreur suppression activité:', err);

			if (err instanceof ClientResponseError && err.status === 400) {
				return fail(400, {
					message:
						"Impossible de supprimer l'activité car elle est liée à une ou plusieurs sessions."
				});
			}

			return fail(500, {
				message: 'Une erreur technique est survenue lors de la suppression.'
			});
		}
	}
};
