import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
	locals.pb.authStore.clear();
	locals.user = null;
	throw redirect(302, '/login');
};
