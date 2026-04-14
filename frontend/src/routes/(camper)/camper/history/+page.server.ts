import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getParisStartOfDay } from '$lib/utils';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const filterDateStart = new Date(getParisStartOfDay());

  const pastParticipations = await prisma.participation.findMany({
    where: {
      talentId: locals.talent.id,
      event: { date: { lt: filterDateStart } },
      isPresent: true,
    },
    include: {
      event: true,
      activities: {
        include: {
          activity: {
            select: {
              id: true,
              nom: true,
              isDynamic: true,
              activityType: true,
            },
          },
        },
      },
    },
    orderBy: { event: { date: 'desc' } },
  });

  return {
    student: locals.talent,
    pastParticipations,
  };
};
