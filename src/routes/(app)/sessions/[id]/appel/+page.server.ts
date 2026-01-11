import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { getActivityXpValue } from '$lib/xp';

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		const session = await locals.pb.collection('sessions').getOne(params.id, {
			expand: 'activity'
		});

		const rawParticipations = await locals.pb.collection('participations').getFullList({
			filter: `session = "${session.id}"`,
			expand: 'student'
		});

		const participations = rawParticipations.sort((a, b) => {
			const nameA = a.expand?.student?.nom ?? '';
			const nameB = b.expand?.student?.nom ?? '';
			return nameA.localeCompare(nameB);
		});

		return {
			session,
			participations
		};
	} catch (e) {
		console.error(e);
		throw error(404, 'Session introuvable');
	}
};

export const actions: Actions = {
	togglePresent: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id') as string;
		const currentState = data.get('state') === 'true';

		try {
			await locals.pb.collection('participations').update(id, {
				is_present: !currentState
			});
			return { success: true };
		} catch (err) {
			return fail(500, { error: 'Erreur mise à jour présence' });
		}
	},

	toggleValidated: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id') as string;
		const currentState = data.get('state') === 'true'; // The state BEFORE the click

		try {
			// 1. Get the participation details including student and session activity
			const p = await locals.pb.collection('participations').getOne(id, {
				expand: 'session.activity'
			});

			const studentId = p.student;
			const isNowValidated = !currentState;

			// 2. Calculate XP value
			const activity = p.expand?.session?.expand?.activity;
			const xpValue = getActivityXpValue(activity?.niveaux);

			// 3. Update the participation record
			await locals.pb.collection('participations').update(id, {
				is_validated: isNowValidated
			});

			// 4. Update Student record using PocketBase atomic increments
			// If now validated: +XP and +1 session. If unvalidated: -XP and -1 session.
			const xpChange = isNowValidated ? xpValue : -xpValue;
			const sessionChange = isNowValidated ? 1 : -1;

			await locals.pb.collection('students').update(studentId, {
				'xp+': xpChange,
				'sessions_count+': sessionChange
			});

			return { success: true };
		} catch (err) {
			console.error('Error updating XP:', err);
			return fail(500, { error: 'Erreur mise à jour validation' });
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
