import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Vérification explicite (hooks l'a déjà fait, mais sécurité)
	if (!locals.user) {
		throw error(401, 'Non autorisé');
	}

	return {
		user: locals.user
	};
};
