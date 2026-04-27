import type { PageServerLoad } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
  const db = scopedPrisma(getCampusId(locals));

  const event = await db.event.findUnique({
    where: { id: params.id },
  });

  if (!event) throw error(404, 'Événement introuvable');

  return { event };
};
