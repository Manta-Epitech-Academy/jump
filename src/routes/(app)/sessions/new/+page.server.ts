import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { sessionSchema } from '$lib/validation/sessions';
import { ClientResponseError } from 'pocketbase';
import { CalendarDateTime, getLocalTimeZone } from '@internationalized/date';

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
		const formData = await request.formData();

		const dateStr = formData.get('date') as string;
		const timeStr = formData.get('time') as string;

		let calendarDateTime: CalendarDateTime | undefined;
		if (dateStr && timeStr) {
			const [year, month, day] = dateStr.split('-').map(Number);
			const [hour, minute] = timeStr.split(':').map(Number);
			calendarDateTime = new CalendarDateTime(year, month, day, hour, minute);
		}

		// Recreate formData to validate the transformed Date object against the schema
		const transformedData = {
			titre: formData.get('titre'),
			date: calendarDateTime,
			time: timeStr,
			statut: formData.get('statut'),
			activity: formData.get('activity')
		};

		const form = await superValidate(transformedData, zod4(sessionSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		let newSessionId = '';

		try {
			// Convert to native JS Date for PocketBase compatibility
			const jsDate = form.data.date.toDate(getLocalTimeZone());

			const payload = {
				titre: form.data.titre,
				date: jsDate,
				statut: form.data.statut,
				activity: form.data.activity
			};

			const record = await locals.pb.collection('sessions').create(payload);
			newSessionId = record.id;
		} catch (err) {
			console.error('Erreur création session:', err);

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
