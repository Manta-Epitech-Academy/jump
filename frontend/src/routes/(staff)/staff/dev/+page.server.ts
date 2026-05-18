import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve as resolvePath } from '$app/paths';
import { CalendarDateTime } from '@internationalized/date';
import { EventService } from '$lib/server/services/events';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import {
  hasFlag,
  requireFlag,
  requireStaffGroup,
} from '$lib/server/auth/guards';
import {
  eventOverlappingWhere,
  getLifecycleBounds,
  ongoingEventWhere,
  upcomingEventWhere,
} from '$lib/domain/eventLifecycle';
import { deriveWorkspaceAlerts } from '$lib/server/services/eventTasks';

export const load: PageServerLoad = async ({ locals, parent }) => {
  if (!locals.user) {
    throw error(401, 'Authentification requise');
  }

  const { activeStage } = await parent();

  if (!hasFlag(locals, 'coding_club')) {
    if (activeStage) {
      throw redirect(303, resolvePath(`/staff/dev/events/${activeStage.id}`));
    }
    return {
      userName: locals.user.name || 'Utilisateur',
      campusName: locals.staffProfile?.campus?.name || 'votre campus',
      timezone: getCampusTimezone(locals),
      ongoingEvents: [],
      upcomingEvents: [],
      topTalents: [],
      kpis: {
        totalTalents: 0,
        completedInterviews: null,
        plannedInterviews: null,
      },
      stageObjectives: null,
      tasks: [],
      minimalist: true,
    };
  }

  try {
    const db = scopedPrisma(getCampusId(locals));
    const tz = getCampusTimezone(locals);
    const bounds = getLifecycleBounds(tz);
    const endOfWeek = new Date(bounds.endOfDay);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const ongoingEvents = await db.event.findMany({
      where: ongoingEventWhere(bounds),
      orderBy: { date: 'asc' },
      include: {
        _count: { select: { participations: true } },
      },
    });

    const topTalents = await db.talent.findMany({
      orderBy: [{ xp: 'desc' }, { eventsCount: 'desc' }],
      take: 5,
      include: { user: true },
    });

    const upcomingEvents = await db.event.findMany({
      where: upcomingEventWhere(bounds),
      include: {
        mantas: true,
        _count: { select: { participations: true } },
      },
      take: 4,
      orderBy: { date: 'asc' },
    });

    const eventsInWeek = await db.event.findMany({
      where: eventOverlappingWhere(bounds.startOfDay, endOfWeek),
      select: { id: true, titre: true, eventType: true },
    });

    // Active stage may sit outside the week window (upcoming-in-30-days).
    // Always include it so its overdue interviews + onboarding gaps surface.
    const alertEventsMap = new Map(eventsInWeek.map((ev) => [ev.id, ev]));
    if (activeStage) {
      const existing = alertEventsMap.get(activeStage.id);
      if (!existing) {
        const stageEvent = await db.event.findUnique({
          where: { id: activeStage.id },
          select: { id: true, titre: true, eventType: true },
        });
        if (stageEvent) alertEventsMap.set(stageEvent.id, stageEvent);
      }
    }

    const tasks = await deriveWorkspaceAlerts(
      db,
      Array.from(alertEventsMap.values()),
      { basePath: '/staff/dev', bounds },
    );

    const totalTalents = await db.talent.count();

    let stageStats: {
      completedInterviews: number;
      plannedInterviews: number;
      totalParticipations: number;
      chartesSigned: number;
    } | null = null;
    if (activeStage) {
      const [
        completedInterviews,
        plannedInterviews,
        totalParticipations,
        chartesSigned,
      ] = await Promise.all([
        db.interview.count({
          where: {
            status: 'completed',
            participation: { eventId: activeStage.id },
          },
        }),
        db.interview.count({
          where: {
            status: 'planned',
            participation: { eventId: activeStage.id },
          },
        }),
        db.participation.count({ where: { eventId: activeStage.id } }),
        prisma.stageCompliance.count({
          where: {
            charteSigned: true,
            participation: { eventId: activeStage.id },
          },
        }),
      ]);
      stageStats = {
        completedInterviews,
        plannedInterviews,
        totalParticipations,
        chartesSigned,
      };
    }

    return {
      userName: locals.user.name || 'Utilisateur',
      campusName: locals.staffProfile?.campus?.name || 'votre campus',
      timezone: tz,
      ongoingEvents,
      upcomingEvents,
      topTalents,
      kpis: {
        totalTalents,
        completedInterviews: stageStats?.completedInterviews ?? null,
        plannedInterviews: stageStats?.plannedInterviews ?? null,
      },
      stageObjectives: stageStats
        ? {
            interviews: stageStats.completedInterviews,
            interviewsTarget: stageStats.totalParticipations,
            chartes: stageStats.chartesSigned,
            totalParticipations: stageStats.totalParticipations,
          }
        : null,
      tasks,
    };
  } catch (err) {
    console.error('Erreur load dashboard:', err);
    throw error(500, 'Erreur chargement dashboard');
  }
};

export const actions: Actions = {
  duplicateEvent: async ({ request, locals }) => {
    requireStaffGroup(locals, 'devLead');
    requireFlag(locals, 'coding_club');
    const data = await request.formData();
    const originalId = data.get('originalId') as string;
    const titre = data.get('titre') as string;
    const dateStr = data.get('date') as string;
    const timeStr = data.get('time') as string;

    if (!originalId || !titre || !dateStr || !timeStr) {
      return fail(400, { message: 'Données manquantes' });
    }

    try {
      const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
      const [hour, minute] = timeStr.split(':').map(Number);
      const cdt = new CalendarDateTime(year, month, day, hour, minute);
      const newDate = cdt.toDate(getCampusTimezone(locals));

      if (isNaN(newDate.getTime())) {
        return fail(400, { message: 'Valeur de temps invalide' });
      }

      const campusId = getCampusId(locals);
      const newEventId = await EventService.duplicateEvent(
        originalId,
        { titre, date: newDate.toISOString() },
        campusId,
      );

      return { success: true, newEventId };
    } catch (err) {
      console.error('Erreur duplication événement:', err);
      return fail(500, { message: 'Erreur lors de la duplication' });
    }
  },
};
