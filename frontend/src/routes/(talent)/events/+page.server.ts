import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

// Legacy path. The list of past events became part of « Mon parcours », which
// tells every event with its activities and XP (#445). Kept as a permanent
// redirect so bookmarks and links already sent keep working.
export const load: PageServerLoad = async () => {
  throw redirect(301, resolve('/parcours'));
};
