import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import type { EventsResponse, ThemesResponse } from '$lib/pocketbase-types';
import { EventService } from '$lib/server/events';

type EventExpand = {
	theme?: ThemesResponse;
};

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const events = await locals.pb
			.collection('events')
			.getFullList<EventsResponse<EventExpand>>({
				sort: '-date',
				filter: `date < '${new Date().toISOString()}'`,
				expand: 'theme',
				requestKey: null
			});

		const eventsWithStats = await Promise.all(
			events.map(async (event) => {
				const participations = await locals.pb.collection('participations').getList(1, 1, {
					filter: `event = "${event.id}" && is_present = true`,
					fields: 'id',
					requestKey: null
				});

				return {
					id: event.id,
					titre: event.titre,
					date: new Date(event.date),
					theme: event.expand?.theme?.nom,
					presentCount: participations.totalItems
				};
			})
		);

		return {
			events: eventsWithStats
		};
	} catch (err) {
		console.error('Error loading history:', err);
		throw error(500, 'Erreur chargement historique');
	}
};

export const actions: Actions = {
	deleteEvent: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);

		try {
			await EventService.deleteEvent(locals.pb, id);
			return { success: true };
		} catch (err) {
			console.error('Erreur suppression événement:', err);
			return fail(500, { message: 'Erreur lors de la suppression' });
		}
	},

	duplicateEvent: async ({ request, locals }) => {
		const data = await request.formData();
		const originalId = data.get('originalId') as string;
		const titre = data.get('titre') as string;
		const dateStr = data.get('date') as string;
		const timeStr = data.get('time') as string;

		if (!originalId || !titre || !dateStr || !timeStr) {
			return fail(400, { message: 'Données manquantes' });
		}

		try {
			const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
			const [hour, minute] = timeStr.split(':').map(Number);
			const newDate = new Date(year, month - 1, day, hour, minute);

			if (isNaN(newDate.getTime())) {
				return fail(400, { message: 'Valeur de temps invalide' });
			}

			const newEventId = await EventService.duplicateEvent(locals.pb, originalId, {
				titre,
				date: newDate.toISOString()
			});

			return { success: true, newEventId };
		} catch (err) {
			console.error('Erreur duplication événement:', err);
			return fail(500, { message: 'Erreur lors de la duplication' });
		}
	}
};
