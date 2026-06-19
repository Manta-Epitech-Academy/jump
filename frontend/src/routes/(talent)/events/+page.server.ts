import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getBrowserTimezone } from '$lib/server/db/scoped';
import { getStartOfDay } from '$lib/utils';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const filterDateStart = new Date(getStartOfDay(getBrowserTimezone(cookies)));

  const pastEvents = await prisma.participation.findMany({
    where: {
      talentId: locals.talent.id,
      isPresent: true,
      event: { eventType: 'coding_club', date: { lt: filterDateStart } },
    },
    select: {
      id: true,
      event: { select: { titre: true, date: true } },
    },
    orderBy: { event: { date: 'desc' } },
  });

  return { pastEvents };
};
