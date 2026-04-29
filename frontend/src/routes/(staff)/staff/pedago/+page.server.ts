import type { PageServerLoad } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { now } from '@internationalized/date';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  const db = scopedPrisma(getCampusId(locals));
  const tz = getCampusTimezone(locals);
  const role = locals.staffProfile?.staffRole;
  const staffProfileId = locals.staffProfile?.id;

  const tzNow = now(tz);
  const startOfDay = tzNow
    .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
    .toDate();
  const endOfDay = tzNow
    .set({ hour: 23, minute: 59, second: 59, millisecond: 999 })
    .toDate();
  const endOfWeek = tzNow
    .add({ days: 7 })
    .set({ hour: 23, minute: 59, second: 59, millisecond: 999 })
    .toDate();

  const liveEvent = await db.event.findFirst({
    where: {
      date: { gte: startOfDay, lte: endOfDay },
    },
    include: {
      theme: true,
      _count: { select: { participations: true } },
      participations: { select: { isPresent: true } },
      mantas: { include: { staffProfile: { include: { user: true } } } },
    },
  });

  const activeAlertsCount = liveEvent
    ? await prisma.stepsProgress.count({
        where: { eventId: liveEvent.id, status: 'needs_help' },
      })
    : 0;

  if (role === 'manta') {
    // Manta-only payload: is this manta assigned to today's event?
    const isOnLiveEvent =
      !!liveEvent &&
      !!staffProfileId &&
      liveEvent.mantas.some((m) => m.staffProfileId === staffProfileId);

    const nextAssignedEvents = staffProfileId
      ? await db.event.findMany({
          where: {
            date: { gt: endOfDay },
            mantas: { some: { staffProfileId } },
          },
          orderBy: { date: 'asc' },
          take: 3,
          include: {
            theme: true,
            _count: { select: { participations: true } },
          },
        })
      : [];

    const cataloguePreview = await prisma.activityTemplate.findMany({
      where: {
        activityType: { not: 'orga' },
        OR: [{ campusId: null }, { campusId: getCampusId(locals) }],
      },
      orderBy: { nom: 'asc' },
      take: 6,
      include: { activityTemplateThemes: { include: { theme: true } } },
    });

    return {
      role,
      timezone: tz,
      liveEvent,
      activeAlertsCount,
      isOnLiveEvent,
      nextAssignedEvents,
      cataloguePreview,
    };
  }

  // Pedago (peda) payload
  const upcomingEvents = await db.event.findMany({
    where: {
      date: { gt: endOfDay },
    },
    orderBy: { date: 'asc' },
    include: {
      theme: true,
      _count: {
        select: {
          participations: true,
        },
      },
      mantas: { include: { staffProfile: { include: { user: true } } } },
      planning: { include: { _count: { select: { timeSlots: true } } } },
    },
  });

  // Task derivations need today's ongoing events too (active stage may have
  // started). upcomingEvents excludes them by design (gt endOfDay) so it
  // serves the "À venir" tab only.
  const eventsInWeek = await db.event.findMany({
    where: { date: { gte: startOfDay, lte: endOfWeek } },
    include: {
      mantas: { select: { staffProfileId: true } },
      planning: {
        include: {
          _count: { select: { timeSlots: true } },
          timeSlots: {
            where: { activity: { is: null } },
            select: { id: true },
          },
        },
      },
    },
  });

  const pastEvents = await db.event.findMany({
    where: {
      date: { lt: startOfDay },
    },
    orderBy: { date: 'desc' },
    take: 20,
    include: {
      theme: true,
      _count: { select: { participations: true } },
      mantas: { include: { staffProfile: { include: { user: true } } } },
    },
  });

  const campusMantas = await prisma.staffProfile.findMany({
    where: {
      campusId: getCampusId(locals),
      staffRole: 'manta',
    },
    include: { user: true },
    orderBy: { user: { name: 'asc' } },
  });

  const eventsMissingMantas = eventsInWeek
    .filter((ev) => ev.mantas.length === 0)
    .map((ev) => ({ id: ev.id, titre: ev.titre, date: ev.date }));
  const eventsMissingPlanning = eventsInWeek
    .filter((ev) => !ev.planning || ev.planning._count.timeSlots === 0)
    .map((ev) => ({ id: ev.id, titre: ev.titre, date: ev.date }));
  // Events that have a planning with at least one unassigned slot. Excluded
  // from this list are events with zero slots (they fall under
  // eventsMissingPlanning) — assigning slots is a different task than
  // creating them.
  const eventsWithUnassignedSlots = eventsInWeek
    .filter(
      (ev) =>
        ev.planning &&
        ev.planning._count.timeSlots > 0 &&
        ev.planning.timeSlots.length > 0,
    )
    .map((ev) => ({
      id: ev.id,
      titre: ev.titre,
      date: ev.date,
      unassignedCount: ev.planning!.timeSlots.length,
    }));

  return {
    role,
    timezone: tz,
    liveEvent,
    activeAlertsCount,
    upcomingEvents,
    pastEvents,
    campusMantas,
    tasks: {
      eventsMissingMantas,
      eventsMissingPlanning,
      eventsWithUnassignedSlots,
    },
  };
};
