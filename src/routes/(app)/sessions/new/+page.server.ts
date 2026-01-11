import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { sessionSchema } from '$lib/validation/sessions';
import { CalendarDateTime, getLocalTimeZone } from '@internationalized/date';

export const load: PageServerLoad = async ({ locals }) => {
	// Fetch existing themes for the datalist selection
	const themes = await locals.pb.collection('themes').getFullList({
		sort: 'nom'
	});

	const form = await superValidate(zod4(sessionSchema));

	return {
		themes,
		form
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();

		const dateStr = formData.get('date') as string;
		const timeStr = formData.get('time') as string;
		const themeInput = formData.get('theme') as string;

		let calendarDateTime: CalendarDateTime | undefined;
		if (dateStr && timeStr) {
			try {
				const [year, month, day] = dateStr.split('-').map(Number);
				const [hour, minute] = timeStr.split(':').map(Number);
				calendarDateTime = new CalendarDateTime(year, month, day, hour, minute);
			} catch (e) {
				// Fallback handled by validation
			}
		}

		const transformedData = {
			titre: formData.get('titre'),
			date: calendarDateTime,
			time: timeStr,
			statut: formData.get('statut'),
			theme: themeInput
		};

		const form = await superValidate(transformedData, zod4(sessionSchema));

		if (form.data.date && typeof form.data.date !== 'string') {
			form.data.date = form.data.date.toString();
		}

		if (!form.valid) {
			return fail(400, { form });
		}

		let newSessionId = '';

		try {
			// THEME LOGIC: Find or Create
			let themeId: string | null = null;
			if (form.data.theme && form.data.theme.trim() !== '') {
				const existing = await locals.pb
					.collection('themes')
					.getList(1, 1, { filter: `nom = "${form.data.theme}"` });

				if (existing.items.length > 0) {
					themeId = existing.items[0].id;
				} else {
					const created = await locals.pb.collection('themes').create({ nom: form.data.theme });
					themeId = created.id;
				}
			}

			if (!calendarDateTime) throw new Error('Date invalide');
			const jsDate = calendarDateTime.toDate(getLocalTimeZone());

			const payload = {
				titre: form.data.titre,
				date: jsDate,
				statut: form.data.statut,
				theme: themeId,
			};

			const record = await locals.pb.collection('sessions').create(payload);
			newSessionId = record.id;
		} catch (err) {
			console.error('Erreur création session:', err);
			return message(form, 'Erreur technique lors de la création.', {
				status: 500
			});
		}

		throw redirect(303, `/sessions/${newSessionId}/builder`);
	}
};
