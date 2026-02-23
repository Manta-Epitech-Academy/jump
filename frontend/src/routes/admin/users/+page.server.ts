import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	// Load all users and their respective campuses alongside the full list of campuses
	const users = await locals.pb.collection('users').getFullList({
		sort: 'name,email',
		expand: 'campus'
	});

	const campuses = await locals.pb.collection('campuses').getFullList({ sort: 'name' });

	return { users, campuses };
};

export const actions: Actions = {
	// Reassign a user to a different campus
	updateCampus: async ({ request, locals }) => {
		const data = await request.formData();
		const userId = data.get('userId') as string;
		const campusId = data.get('campusId') as string;

		if (!userId) return fail(400);

		try {
			await locals.pb.collection('users').update(userId, {
				campus: campusId || null
			});
			return { success: true };
		} catch (err) {
			console.error(err);
			return fail(500, { message: 'Erreur lors de la mise à jour' });
		}
	},

	// Revoke a user's access entirely
	deleteUser: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);

		try {
			await locals.pb.collection('users').delete(id);
			return { success: true };
		} catch (err) {
			return fail(500, { message: 'Erreur lors de la suppression du membre.' });
		}
	}
};
