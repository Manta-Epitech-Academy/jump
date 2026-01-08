import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { sessionSchema } from '$lib/validation/sessions';
import { ClientResponseError } from 'pocketbase';

export const load: PageServerLoad = async ({ locals }) => {
	const activities = await locals.pb.collection('activities').getFullList({
		sort: 'nom'
	});

	const form = await superValidate(zod4(sessionSchema));

	return {
		activities,
		form
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(sessionSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		let newSessionId = '';

		try {
			const payload = {
				...form.data,
				date: new Date(form.data.date)
			};

			const record = await locals.pb.collection('sessions').create(payload);
			newSessionId = record.id;
		} catch (err) {
			console.error('Erreur création session:', err);

			// Si c'est une erreur PocketBase, on l'affiche plus en détail dans la console
			if (err instanceof ClientResponseError) {
				console.error('Détails erreur PB:', err.response);
			}

			return message(form, 'Erreur technique lors de la création (Vérifiez la console serveur).', {
				status: 500
			});
		}

		throw redirect(303, `/sessions/${newSessionId}/builder`);
	}
};
