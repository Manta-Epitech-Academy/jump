import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { getSubjectXpValue } from '$lib/xp';
import { now } from '@internationalized/date';
import type {
	EventsResponse,
	ThemesResponse,
	ParticipationsResponse,
	SubjectsResponse
} from '$lib/pocketbase-types';

type EventExpand = {
	theme?: ThemesResponse;
};

type ParticipationExpand = {
	subject?: SubjectsResponse;
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
			sort: '-date',
			filter: `date >= '${filterDate.toISOString()}' && statut = 'planifiee'`,
			expand: 'theme'
		});

		return {
			events: events.map((event) => ({
				id: event.id,
				titre: event.titre,
				date: new Date(event.date),
				statut: event.statut,
				theme: event.expand?.theme?.nom
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
			const participations = await locals.pb
				.collection('participations')
				.getFullList<ParticipationsResponse<ParticipationExpand>>({
					filter: `event = "${id}" && is_present = true`,
					expand: 'subject'
				});

			for (const p of participations) {
				const subject = p.expand?.subject;
				const xpValue = subject ? getSubjectXpValue(subject.niveaux) : 20;

				await locals.pb.collection('students').update(p.student, {
					'xp-': xpValue,
					'events_count-': 1
				});
			}

			await locals.pb.collection('events').delete(id);

			return { success: true };
		} catch (err) {
			console.error('Erreur suppression événement:', err);
			return fail(500, { message: 'Erreur lors de la suppression' });
		}
	}
};
