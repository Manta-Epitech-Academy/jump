import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { toCalendarPlanning } from '$lib/domain/talentPlanning';
import { requireFlag } from '$lib/server/auth/guards';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');
  requireFlag(locals, 'planning');

  // Every event the talent participates in, past and future: the calendar is
  // their full personal timeline, not a single-event view. Non-orga activities
  // only, sorted by start so the grid's per-day packer gets ordered input.
  const participations = await prisma.participation.findMany({
    where: { talentId: locals.talent.id },
    select: {
      event: {
        select: {
          id: true,
          titre: true,
          date: true,
          endDate: true,
          planning: {
            select: {
              timeSlots: {
                where: { activity: { activityType: { not: 'orga' } } },
                select: {
                  id: true,
                  startTime: true,
                  endTime: true,
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

  return {
    planning: toCalendarPlanning(participations),
    serverNow: Date.now(),
  };
};
