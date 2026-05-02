import type { PageServerLoad } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { prisma } from '$lib/server/db';
import {
  eventOverlappingWhere,
  getLifecycleBounds,
  ongoingEventWhere,
  pastEventWhere,
  upcomingEventWhere,
} from '$lib/domain/eventLifecycle';

export const load: PageServerLoad = async ({ locals }) => {
  const db = scopedPrisma(getCampusId(locals));
  const tz = getCampusTimezone(locals);
  const role = locals.staffProfile?.staffRole;
  const staffProfileId = locals.staffProfile?.id;

  const bounds = getLifecycleBounds(tz);
  const endOfWeek = new Date(bounds.endOfDay);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const liveEvent = await db.event.findFirst({
    where: ongoingEventWhere(bounds),
    orderBy: { date: 'asc' },
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
            ...upcomingEventWhere(bounds),
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
    where: upcomingEventWhere(bounds),
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

  // Task derivations cover everything overlapping the next week, including
  // multi-day events that started earlier — they still need mantas/planning
  // attention now. upcomingEvents serves the "À venir" tab only.
  const eventsInWeek = await db.event.findMany({
    where: eventOverlappingWhere(bounds.startOfDay, endOfWeek),
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
    where: pastEventWhere(bounds),
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
