import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
	// Registration is disabled. Redirect to login.
	throw redirect(302, '/login');
};

export const actions = {};
