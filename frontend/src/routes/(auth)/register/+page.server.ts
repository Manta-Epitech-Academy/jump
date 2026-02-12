import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

export const load: PageServerLoad = async () => {
	// Registration is disabled. Redirect to login.
	throw redirect(302, resolve('/login'));
};

export const actions = {};
