import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { resolve } from '$app/paths';

export const actions: Actions = {
	default: async ({ locals, url }) => {
		// Check the URL parameter to determine which session to end
		const type = url.searchParams.get('type');

		if (type === 'admin') {
			// Clear Admin Auth
			if (locals.adminPb) locals.adminPb.authStore.clear();

			// If we are currently in an admin context, ensure locals.user is null immediately
			if (locals.user?.collectionName === '_superusers') {
				locals.user = null;
			}

			throw redirect(302, resolve('/admin/login'));
		} else {
			// Clear User/Staff Auth
			if (locals.staffPb) locals.staffPb.authStore.clear();

			if (locals.user?.collectionName === 'users') {
				locals.user = null;
			}

			throw redirect(302, resolve('/login'));
		}
	}
};
