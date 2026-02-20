import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { getSubjectXpValue } from '$lib/xp';
import { now } from '@internationalized/date';
import { createScoped } from '$lib/pocketbase';
import {
	type EventsResponse,
	type ThemesResponse,
	type ParticipationsResponse,
	type SubjectsResponse
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
			sort: 'date',
			filter: `date >= '${filterDate.toISOString()}'`,
			expand: 'theme'
		});

		return {
			events: events.map((event) => ({
				id: event.id,
				titre: event.titre,
				date: new Date(event.date),
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
			// 1. Fetch original event details (mainly for theme)
			const original = await locals.pb.collection('events').getOne(originalId);

			// 2. Construct new ISO date
			const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
			const [hour, minute] = timeStr.split(':').map(Number);
			const newDate = new Date(year, month - 1, day, hour, minute);

			if (isNaN(newDate.getTime())) {
				return fail(400, { message: 'Valeur de temps invalide' });
			}

			// 3. Create new event
			const payload = {
				titre: titre,
				date: newDate.toISOString(),
				theme: original.theme
			};

			const newEventRecord = await createScoped(locals.pb, 'events', payload);

			// 4. Duplicate participants
			const originalParticipations = await locals.pb.collection('participations').getFullList({
				filter: `event = "${originalId}"`,
				requestKey: null
			});

			for (const p of originalParticipations) {
				await createScoped(locals.pb, 'participations', {
					student: p.student,
					event: newEventRecord.id,
					subjects: p.subjects,
					bring_pc: p.bring_pc,
					is_present: false, // Reset presence
					note: '' // Reset notes
				});
			}

			return { success: true, newEventId: newEventRecord.id };
		} catch (err) {
			console.error('Erreur duplication événement:', err);
			return fail(500, { message: 'Erreur lors de la duplication' });
		}
	}
};
