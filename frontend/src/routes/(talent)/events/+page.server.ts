import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const pastEvents = await prisma.participation.findMany({
    where: {
      talentId: locals.talent.id,
      isPresent: true,
      event: {
        eventType: 'coding_club',
        date: { lte: new Date(new Date().setHours(23, 59, 59, 999)) },
      },
    },
    select: {
      id: true,
      event: { select: { titre: true, date: true } },
    },
    orderBy: { event: { date: 'desc' } },
  });

  return { pastEvents };
};
