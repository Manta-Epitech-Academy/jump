import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { getSubjectXpValue } from '$lib/xp';
import type {
	ParticipationsResponse,
	StudentsResponse,
	SubjectsResponse
} from '$lib/pocketbase-types';

type ParticipationExpand = {
	student?: StudentsResponse;
	subject?: SubjectsResponse;
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
				expand: 'student,subject'
			});

		const participations = rawParticipations.sort((a, b) => {
			const nameA = a.expand?.student?.nom ?? '';
			const nameB = b.expand?.student?.nom ?? '';
			return nameA.localeCompare(nameB);
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
					expand: 'subject'
				});

			const studentId = p.student;
			const isNowPresent = !currentState;

			// If a specific subject is assigned to this participation, use its levels.
			// Otherwise, grant a default of 20 XP.
			const subject = p.expand?.subject;
			const xpValue = subject ? getSubjectXpValue(subject.niveaux) : 20;

			await locals.pb.collection('participations').update(id, {
				is_present: isNowPresent
			});

			const xpChange = isNowPresent ? xpValue : -xpValue;
			const eventChange = isNowPresent ? 1 : -1;

			await locals.pb.collection('students').update(studentId, {
				'xp+': xpChange,
				'events_count+': eventChange
			});

			return { success: true };
		} catch (err) {
			console.error('Error updating presence/XP:', err);
			return fail(500, { error: 'Erreur mise à jour présence' });
		}
	},

	updateNote: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id') as string;
		const note = data.get('note') as string;

		try {
			await locals.pb.collection('participations').update(id, {
				note: note
			});
			return { success: true };
		} catch (err) {
			return fail(500, { error: 'Erreur sauvegarde note' });
		}
	}
};
