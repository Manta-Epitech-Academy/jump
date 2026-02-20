import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import type { EventsResponse, ThemesResponse, ParticipationsResponse, SubjectsResponse } from '$lib/pocketbase-types';
import { getSubjectXpValue } from '$lib/xp';
import { createScoped } from '$lib/pocketbase';

type EventExpand = {
	theme?: ThemesResponse;
};

type ParticipationExpand = {
	subject?: SubjectsResponse;
};

export const load: PageServerLoad = async ({ locals }) => {
	try {
		// Fetch events that are in the past
		const events = await locals.pb.collection('events').getFullList<EventsResponse<EventExpand>>({
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

	duplicateEvent: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);

		try {
			// 1. Fetch original event
			const original = await locals.pb.collection('events').getOne(id);

			// 2. Fetch original participations (students registered)
			const originalParticipations = await locals.pb.collection('participations').getFullList({
				filter: `event = "${id}"`,
				requestKey: null
			});

			// 3. Determine new date
			const originalDate = new Date(original.date);
			const now = new Date();
			let newDate = originalDate;

			if (originalDate < now) {
				const tomorrow = new Date();
				tomorrow.setDate(tomorrow.getDate() + 1);
				tomorrow.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
				newDate = tomorrow;
			}

			// 4. Create new event
			const payload = {
				titre: `${original.titre} (Copie)`,
				date: newDate.toISOString(),
				theme: original.theme
			};

			const newEventRecord = await createScoped(locals.pb, 'events', payload);

			// 5. Duplicate registered students to the new event
			for (const p of originalParticipations) {
				await createScoped(locals.pb, 'participations', {
					student: p.student,
					event: newEventRecord.id,
					subject: p.subject,
					bring_pc: p.bring_pc,
					is_present: false,
					note: ''
				});
			}

			return { success: true };
		} catch (err) {
			console.error('Erreur duplication événement:', err);
			return fail(500, { message: 'Erreur lors de la duplication' });
		}
	}
};
