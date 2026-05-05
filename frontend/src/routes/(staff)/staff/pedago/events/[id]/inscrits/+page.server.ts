import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';

export const load: PageServerLoad = async ({ params, locals }) => {
  const db = scopedPrisma(getCampusId(locals));

  const event = await db.event
    .findUniqueOrThrow({
      where: { id: params.id },
      include: { theme: true },
    })
    .catch(() => {
      throw error(404, 'Événement introuvable.');
    });

  const participations = await db.participation.findMany({
    where: { eventId: event.id },
    include: { talent: true },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  return { event, participations };
};
