import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getCampusId } from '$lib/server/db/scoped';
import { loadEventOr404 } from '$lib/server/services/stageContext';

export const load: PageServerLoad = async ({ params, locals }) => {
  await loadEventOr404(params.id, getCampusId(locals));
  throw redirect(302, resolve(`/staff/pedago/events/${params.id}/presences`));
};
