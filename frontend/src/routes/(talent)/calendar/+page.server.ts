import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // Ongoing (date range covers today) or nearest upcoming event.
  // Comparing against startOfDay(now) keeps the event visible for its whole
  // last day, matching the dashboard's "À venir"/today filter.
  const participation = await prisma.participation.findFirst({
    where: {
      talentId: locals.talent.id,
      event: {
        OR: [
          // Multi-day event whose span covers today or is upcoming
          { endDate: { gte: todayStart } },
          // Single-day event today or upcoming
          { endDate: null, date: { gte: todayStart } },
        ],
      },
    },
    include: {
      event: {
        include: {
          planning: {
            include: {
              timeSlots: {
                where: { activity: { activityType: { not: 'orga' } } },
                include: {
                  activity: {
                    select: {
                      id: true,
                      nom: true,
                      description: true,
                      activityType: true,
                      difficulte: true,
                      isDynamic: true,
                    },
                  },
                },
                orderBy: { startTime: 'asc' },
              },
            },
          },
        },
      },
    },
    orderBy: { event: { date: 'asc' } },
  });

  if (!participation) {
    throw error(404, 'Aucun événement en cours ou à venir.');
  }

  return { participation, serverNow: Date.now() };
};
