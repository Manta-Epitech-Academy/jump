import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // Ongoing (endDate on or after today) or nearest upcoming multi-day event.
  // Comparing against startOfDay(now) keeps the event visible for its whole
  // last day, matching the dashboard's "À venir"/today filter.
  const candidates = await prisma.participation.findMany({
    where: {
      talentId: locals.talent.id,
      event: {
        endDate: { not: null, gte: todayStart },
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

  const participation = candidates.find(
    (p) => p.event.endDate && !sameCalendarDay(p.event.date, p.event.endDate),
  );

  if (!participation) {
    throw error(404, 'Aucun événement multi-jours en cours ou à venir.');
  }

  return { participation, serverNow: Date.now() };
};
