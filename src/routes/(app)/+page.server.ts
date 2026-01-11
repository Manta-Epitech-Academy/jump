import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { getActivityXpValue } from '$lib/xp';

export const load: PageServerLoad = async ({ locals }) => {
	// Redundant but explicit auth check
	if (!locals.pb.authStore.isValid) {
		throw error(401, 'Authentification requise');
	}

	try {
		const sessions = await locals.pb.collection('sessions').getFullList({
			sort: '-date',
			filter: `date >= '${new Date().toISOString()}' && statut = 'planifiee'`,
			expand: 'theme'
		});

		return {
			sessions: sessions.map((session) => ({
				id: session.id,
				titre: session.titre,
				date: new Date(session.date),
				statut: session.statut,
				theme: session.expand?.theme?.nom
			}))
		};
	} catch (err) {
		console.error('Erreur load dashboard:', err);
		throw error(500, 'Erreur chargement sessions');
	}
};

export const actions: Actions = {
	deleteSession: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);

		try {
			// 1. Get all validated participations to revert XP before deleting
			const participations = await locals.pb.collection('participations').getFullList({
				filter: `session = "${id}" && is_validated = true`,
				expand: 'activity'
			});

			// 2. Revert XP/Sessions count for each student manually
			for (const p of participations) {
				const activity = p.expand?.activity;
				const xpValue = activity ? getActivityXpValue(activity.niveaux) : 20;

				await locals.pb.collection('students').update(p.student, {
					'xp-': xpValue,
					'sessions_count-': 1
				});
			}

			// 3. Delete the session
			await locals.pb.collection('sessions').delete(id);

			return { success: true };
		} catch (err) {
			console.error('Erreur suppression session:', err);
			return fail(500, { message: 'Erreur lors de la suppression' });
		}
	}
};
