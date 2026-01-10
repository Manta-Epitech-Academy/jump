import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';

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
		const currentState = data.get('state') === 'true';

		try {
			await locals.pb.collection('participations').update(id, {
				is_validated: !currentState
			});
			return { success: true };
		} catch (err) {
			return fail(500, { error: 'Erreur mise à jour validation' });
		}
	}
};
