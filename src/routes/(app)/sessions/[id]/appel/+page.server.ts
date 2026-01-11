import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { getActivityXpValue } from '$lib/xp';

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		const session = await locals.pb.collection('sessions').getOne(params.id, {
			expand: 'theme'
		});

		const rawParticipations = await locals.pb.collection('participations').getFullList({
			filter: `session = "${session.id}"`,
			expand: 'student,activity'
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
		const currentState = data.get('state') === 'true';

		try {
			const p = await locals.pb.collection('participations').getOne(id, {
				expand: 'activity'
			});

			const studentId = p.student;
			const isNowValidated = !currentState;

			// XP Logic: Theme sessions have no metadata.
			// If a specific activity is assigned to this participation, use its levels.
			// Otherwise, grant a default of 20 XP.
			const activity = p.expand?.activity;
			const xpValue = activity ? getActivityXpValue(activity.niveaux) : 20;

			await locals.pb.collection('participations').update(id, {
				is_validated: isNowValidated
			});

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
