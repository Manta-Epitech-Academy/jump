import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

// Legacy path. The XP history became « Mon parcours » (XP, finished
// activities, past events), so it moved to /parcours. Kept as a permanent
// redirect so bookmarks and links already sent keep working.
export const load: PageServerLoad = async () => {
  throw redirect(301, resolve('/parcours'));
};
