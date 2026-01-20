import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		// Fetch events that are in the past
		const events = await locals.pb.collection('events').getFullList({
			sort: '-date', // Most recent past events first
			filter: `date < '${new Date().toISOString()}'`,
			expand: 'theme',
			requestKey: null
		});

		// Fetch participations count for these events to show stats
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
					statut: event.statut,
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
