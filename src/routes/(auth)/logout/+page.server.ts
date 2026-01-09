import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ locals }) => {
		// Clear the PocketBase auth store
		locals.pb.authStore.clear();
		locals.user = null;

		// Redirect to login page
		throw redirect(302, '/login');
	}
};
