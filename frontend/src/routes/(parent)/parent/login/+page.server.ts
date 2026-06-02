import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

export const load: PageServerLoad = async () => {
  throw redirect(301, resolve('/login'));
};
