import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import type { UsersResponse } from '$lib/pocketbase-types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// If already has a campus, go home, UNLESS we are explicitly asking to change it
	const user = locals.user as UsersResponse | null;
	if (user?.campus && !url.searchParams.get('change')) {
		throw redirect(303, resolve('/'));
	}

	try {
		// List all available campuses
		// Ensure your 'campuses' collection API rules allow public or auth-only list
		const campuses = await locals.pb.collection('campuses').getFullList({
			sort: 'name'
		});

		return {
			campuses
		};
	} catch (e) {
		console.error('Error loading campuses:', e);
		return { campuses: [] };
	}
};

export const actions: Actions = {
	joinCampus: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, resolve('/login'));

		const formData = await request.formData();
		const campusId = formData.get('campusId') as string;

		if (!campusId) {
			return fail(400, { message: 'Veuillez sélectionner un campus.' });
		}

		try {
			// Update the user's profile with the selected campus
			await locals.pb.collection('users').update(locals.user.id, {
				campus: campusId
			});

			// Refresh locals just in case (though redirect will trigger hook again)
			(locals.user as UsersResponse).campus = campusId;
		} catch (err) {
			console.error('Error joining campus:', err);
			return fail(500, { message: 'Erreur lors de la sauvegarde du campus.' });
		}

		throw redirect(303, resolve('/'));
	}
};
