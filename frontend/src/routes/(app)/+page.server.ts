import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { pbUrl } from '$lib/pocketbase';
import { now } from '@internationalized/date';
import { EventService } from '$lib/server/events';
import type { EventsResponse, ThemesResponse, UsersResponse } from '$lib/pocketbase-types';

type EventExpand = {
	theme?: ThemesResponse;
	mantas?: UsersResponse[];
};

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.pb.authStore.isValid) {
		throw error(401, 'Authentification requise');
	}

	try {
		const parisNow = now('Europe/Paris');
		const startOfDayParis = parisNow.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
		const filterDate = startOfDayParis.toDate();

		const events = await locals.pb.collection('events').getFullList<EventsResponse<EventExpand>>({
			sort: 'date',
			filter: `date >= '${filterDate.toISOString()}'`,
			expand: 'theme,mantas'
		});

		return {
			events: events.map((event) => ({
				id: event.id,
				titre: event.titre,
				date: new Date(event.date),
				theme: event.expand?.theme?.nom,
				mantas: event.expand?.mantas?.map(m => ({
					name: m.name || m.username,
					avatarUrl: m.avatar ? `${pbUrl}/api/files/${m.collectionId}/${m.id}/${m.avatar}` : null
				})) ||[]
			}))
		};
	} catch (err) {
		console.error('Erreur load dashboard:', err);
		throw error(500, 'Erreur chargement événements');
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
		const timeStr = data.get('time') as string; // HH:MM

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
