import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { now } from '@internationalized/date';
import { getBrowserTimezone } from '$lib/server/db/scoped';
import { getStartOfDay } from '$lib/utils';

export const load: PageServerLoad = async ({ locals, params, cookies }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  const parentEmail = locals.user.email;
  const { talentId } = params;

  const child = await prisma.talent.findUnique({
    where: { id: talentId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      parentEmail: true,
      imageRightsSignedAt: true,
    },
  });

  // Security: verify this child belongs to the parent
  if (!child || child.parentEmail !== parentEmail) {
    throw redirect(303, resolve('/parent'));
  }

  // Check how many children the parent has (for UI: hide back button if single child)
  const siblingCount = await prisma.talent.count({
    where: { parentEmail },
  });

  // Calculate today boundaries
  const tz = getBrowserTimezone(cookies);
  const filterDateStart = getStartOfDay(tz);
  const tzNow = now(tz);
  const endOfDay = tzNow.set({
    hour: 23,
    minute: 59,
    second: 59,
    millisecond: 999,
  });
  const filterDateEnd = endOfDay.toDate();
  const filterDateStartDate = new Date(filterDateStart);

  // Fetch today's participation with full planning chain (timeSlots → activities)
  const todayParticipation = await prisma.participation.findFirst({
    where: {
      talentId,
      event: {
        date: { gte: filterDateStartDate, lte: filterDateEnd },
      },
    },
    include: {
      event: {
        include: {
          planning: {
            include: {
              timeSlots: {
                include: {
                  activities: {
                    where: { activityType: { not: 'orga' } },
                    select: {
                      id: true,
                      nom: true,
                      activityType: true,
                      difficulte: true,
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

  // Fetch upcoming events with full planning chain
  const upcomingParticipations = await prisma.participation.findMany({
    where: {
      talentId,
      event: { date: { gt: filterDateEnd } },
    },
    include: {
      event: {
        include: {
          planning: {
            include: {
              timeSlots: {
                include: {
                  activities: {
                    where: { activityType: { not: 'orga' } },
                    select: {
                      id: true,
                      nom: true,
                      activityType: true,
                      difficulte: true,
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

  // Fetch past participations with activities for history
  const participations = await prisma.participation.findMany({
    where: { talentId, event: { date: { lt: filterDateStartDate } } },
    include: {
      event: { select: { id: true, titre: true, date: true } },
      activities: {
        include: {
          activity: {
            select: { id: true, nom: true, activityType: true },
          },
        },
      },
    },
    orderBy: { event: { date: 'desc' } },
  });

  return {
    parentName: locals.user.name,
    hasMultipleChildren: siblingCount > 1,
    todayPlanning: todayParticipation
      ? {
          eventName: todayParticipation.event.titre,
          eventDate: todayParticipation.event.date,
          timeSlots: (todayParticipation.event.planning?.timeSlots ?? []).map(
            (slot) => ({
              id: slot.id,
              startTime: slot.startTime,
              endTime: slot.endTime,
              label: slot.label,
              activities: slot.activities.map((a) => ({
                id: a.id,
                name: a.nom,
                type: a.activityType,
                difficulty: a.difficulte,
              })),
            }),
          ),
        }
      : null,
    child: {
      id: child.id,
      prenom: child.prenom,
      nom: child.nom,
      imageRightsSigned: !!child.imageRightsSignedAt,
    },
    upcomingEvents: upcomingParticipations.map((p) => ({
      id: p.event.id,
      name: p.event.titre,
      date: p.event.date,
      timeSlots: (p.event.planning?.timeSlots ?? []).map((slot) => ({
        id: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        label: slot.label,
        activities: slot.activities.map((a) => ({
          id: a.id,
          name: a.nom,
          type: a.activityType,
          difficulty: a.difficulte,
        })),
      })),
    })),
    participations: participations.map((p) => ({
      id: p.id,
      eventName: p.event.titre,
      eventDate: p.event.date,
      isPresent: p.isPresent,
      activities: p.activities
        .filter((a) => a.activity.activityType !== 'orga')
        .map((a) => ({
          id: a.activity.id,
          name: a.activity.nom,
          type: a.activity.activityType,
        })),
    })),
  };
};
