import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { activitySchema } from '$lib/validation/activities';

export const load: PageServerLoad = async ({ locals }) => {
	const activities = await locals.pb.collection('activities').getFullList({
		sort: '-created'
	});

	const form = await superValidate(zod4(activitySchema));

	return {
		activities,
		form
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(activitySchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await locals.pb.collection('activities').create(form.data);
			return message(form, 'Activité créée avec succès !');
		} catch (err) {
			console.error('Erreur création activité:', err);
			return message(form, 'Erreur lors de la création', { status: 500 });
		}
	}
};
