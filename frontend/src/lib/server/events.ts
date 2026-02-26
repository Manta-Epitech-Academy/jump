import { getTotalXp } from '$lib/xp';
import { createScoped } from '$lib/pocketbase';
import type { TypedPocketBase, ParticipationsResponse, SubjectsResponse } from '$lib/pocketbase-types';

type ParticipationExpand = {
	subjects?: SubjectsResponse[];
};

export const EventService = {
	/**
	 * Deletes an event and automatically rolls back XP for all present students.
	 */
	async deleteEvent(pb: TypedPocketBase, eventId: string) {
		// 1. Fetch participations to calculate XP to remove
		const participations = await pb
			.collection('participations')
			.getFullList<ParticipationsResponse<ParticipationExpand>>({
				filter: `event = "${eventId}" && is_present = true`,
				expand: 'subjects'
			});

		// 2. Rollback XP
		for (const p of participations) {
			const subjects = p.expand?.subjects || [];
			const xpValue = getTotalXp(subjects);

			await pb.collection('students').update(p.student, {
				'xp-': xpValue,
				'events_count-': 1
			});
		}

		// 3. Delete the event record
		await pb.collection('events').delete(eventId);
	},

	/**
	 * Duplicates an event and its participants (resetting status).
	 */
	async duplicateEvent(
		pb: TypedPocketBase,
		originalId: string,
		newData: { titre: string; date: string }
	) {
		// 1. Get original event to copy theme
		const original = await pb.collection('events').getOne(originalId);

		// 2. Create new event
		const newEvent = await createScoped(pb, 'events', {
			titre: newData.titre,
			date: newData.date,
			theme: original.theme,
			mantas: original.mantas
		});

		// 3. Fetch original participations
		const participations = await pb.collection('participations').getFullList({
			filter: `event = "${originalId}"`,
			requestKey: null
		});

		// 4. Duplicate participants (resetting status)
		for (const p of participations) {
			await createScoped(pb, 'participations', {
				student: p.student,
				event: newEvent.id,
				subjects: p.subjects,
				bring_pc: p.bring_pc,
				is_present: false,
				note: ''
			});
		}

		return newEvent.id;
	}
};
