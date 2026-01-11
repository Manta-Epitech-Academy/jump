import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

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
