import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { prisma } from '$lib/server/db';
import { now } from '@internationalized/date';

export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);
  const tz = getCampusTimezone(locals);

  const event = await db.event
    .findUniqueOrThrow({
      where: { id: params.id },
      include: {
        theme: true,
        mantas: { include: { staffProfile: { include: { user: true } } } },
        _count: { select: { participations: true } },
        planning: {
          include: {
            _count: { select: { timeSlots: true } },
            timeSlots: {
              select: {
                id: true,
                activity: { select: { id: true, activityType: true } },
              },
            },
          },
        },
      },
    })
    .catch(() => {
      throw error(404, 'Événement introuvable.');
    });

  const participations = await db.participation.findMany({
    where: { eventId: event.id },
    include: { talent: true },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const campusMantas = await prisma.staffProfile.findMany({
    where: { campusId, staffRole: 'manta' },
    include: { user: true },
    orderBy: { user: { name: 'asc' } },
  });

  const tzNow = now(tz);
  const startOfDay = tzNow
    .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
    .toDate();
  const endOfDay = tzNow
    .set({ hour: 23, minute: 59, second: 59, millisecond: 999 })
    .toDate();

  const isLive = event.date >= startOfDay && event.date <= endOfDay;
  const isPast = (event.endDate ?? event.date) < startOfDay;
  const isUpcoming = event.date > endOfDay;

  const activeAlertsCount = isLive
    ? await prisma.stepsProgress.count({
        where: { eventId: event.id, status: 'needs_help' },
      })
    : 0;

  const totalSlots = event.planning?._count.timeSlots ?? 0;
  const unassignedSlotsCount =
    event.planning?.timeSlots.filter((ts) => !ts.activity).length ?? 0;
  const orgaSlotsCount =
    event.planning?.timeSlots.filter(
      (ts) => ts.activity?.activityType === 'orga',
    ).length ?? 0;

  const presentCount = participations.filter((p) => p.isPresent).length;
  const lateCount = participations.filter((p) => (p.delay ?? 0) > 0).length;

  return {
    event,
    participations,
    campusMantas,
    timezone: tz,
    status: { isLive, isPast, isUpcoming },
    readiness: {
      hasMantas: event.mantas.length > 0,
      mantasCount: event.mantas.length,
      hasPlanning: !!event.planning,
      totalSlots,
      unassignedSlotsCount,
      orgaSlotsCount,
    },
    kpis: {
      participantsCount: participations.length,
      presentCount,
      lateCount,
      activeAlertsCount,
    },
  };
};
