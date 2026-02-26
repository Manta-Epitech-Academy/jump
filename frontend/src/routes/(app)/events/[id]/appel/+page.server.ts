import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { getTotalXp } from '$lib/xp';
import type {
	ParticipationsResponse,
	StudentsResponse,
	SubjectsResponse
} from '$lib/pocketbase-types';

type ParticipationExpand = {
	student?: StudentsResponse;
	subjects?: SubjectsResponse[];
};

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		const event = await locals.pb.collection('events').getOne(params.id, {
			expand: 'theme'
		});

		const rawParticipations = await locals.pb
			.collection('participations')
			.getFullList<ParticipationsResponse<ParticipationExpand>>({
				filter: `event = "${event.id}"`,
				expand: 'student,subjects'
			});

		const participations = rawParticipations.sort((a, b) => {
			const nomA = a.expand?.student?.nom?.toUpperCase() ?? '';
			const nomB = b.expand?.student?.nom?.toUpperCase() ?? '';
			if (nomA < nomB) return -1;
			if (nomA > nomB) return 1;

			// If noms are equal, sort by prenom
			const prenomA = a.expand?.student?.prenom?.toLowerCase() ?? '';
			const prenomB = b.expand?.student?.prenom?.toLowerCase() ?? '';
			return prenomA.localeCompare(prenomB);
		});

		return {
			event,
			participations
		};
	} catch (e) {
		console.error(e);
		throw error(404, 'Événement introuvable');
	}
};

export const actions: Actions = {
	togglePresent: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id') as string;
		const currentState = data.get('state') === 'true';

		try {
			const p = await locals.pb
				.collection('participations')
				.getOne<ParticipationsResponse<ParticipationExpand>>(id, {
					expand: 'subjects'
				});

			const studentId = p.student;
			const isNowPresent = !currentState;

			// Sum XP of all assigned subjects
			const subjects = p.expand?.subjects || [];
			const xpValue = getTotalXp(subjects);

			const updatePayload: any = {
				is_present: isNowPresent
			};

			// If marking absent, reset delay to 0
			if (!isNowPresent) {
				updatePayload.delay = 0;
			}

			await locals.pb.collection('participations').update(id, updatePayload);

			// Only update student stats if status actually changed
			if (p.is_present !== isNowPresent) {
				const xpChange = isNowPresent ? xpValue : -xpValue;
				const eventChange = isNowPresent ? 1 : -1;

				await locals.pb.collection('students').update(studentId, {
					'xp+': xpChange,
					'events_count+': eventChange
				});
			}

			return { success: true };
		} catch (err) {
			console.error('Error updating presence/XP:', err);
			return fail(500, { error: 'Erreur mise à jour présence' });
		}
	},

	updateDelay: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id') as string;
		const delayStr = data.get('delay') as string;
		const delay = parseInt(delayStr, 10);

		if (isNaN(delay)) return fail(400);

		try {
			const p = await locals.pb
				.collection('participations')
				.getOne<ParticipationsResponse<ParticipationExpand>>(id, {
					expand: 'subjects'
				});

			// If previously absent and now marking late, they become present
			const wasAbsent = !p.is_present;

			await locals.pb.collection('participations').update(id, {
				delay: delay,
				is_present: true // Implicitly present if late
			});

			if (wasAbsent) {
				const subjects = p.expand?.subjects || [];
				const xpValue = getTotalXp(subjects);
				await locals.pb.collection('students').update(p.student, {
					'xp+': xpValue,
					'events_count+': 1
				});
			}

			return { success: true };
		} catch (err) {
			console.error('Error updating delay:', err);
			return fail(500, { error: 'Erreur mise à jour retard' });
		}
	},

	updateNote: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id') as string;
		const note = data.get('note') as string;

		try {
			await locals.pb.collection('participations').update(id, {
				note: note,
				note_author: locals.user?.id
			});
			return { success: true };
		} catch (err) {
			return fail(500, { error: 'Erreur sauvegarde note' });
		}
	}
};
