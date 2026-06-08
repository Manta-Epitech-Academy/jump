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
  type ScopedPrismaClient,
} from '$lib/server/db/scoped';
import { rulesCompliantWhere } from '$lib/server/db/stageCompliance';
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
      // Stage-only landing: drop the dev straight onto the inscrits table
      // (the dashboard + event overview are coding_club-era surfaces).
      throw redirect(
        303,
        resolvePath(`/staff/dev/events/${activeStage.id}/inscrits`),
      );
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

    // Every independent aggregate the dashboard hero needs, fired in one
    // wave instead of six sequential round-trips. `stageStats` only depends
    // on the active stage (already resolved by the layout), so it joins the
    // wave rather than trailing it.
    const [
      ongoingEvents,
      topTalents,
      upcomingEvents,
      eventsInWeek,
      totalTalents,
      stageStats,
    ] = await Promise.all([
      db.event.findMany({
        where: ongoingEventWhere(bounds),
        orderBy: { date: 'asc' },
        include: {
          _count: { select: { participations: true } },
        },
      }),
      db.talent.findMany({
        orderBy: [{ xp: 'desc' }, { eventsCount: 'desc' }],
        take: 5,
        include: { user: true },
      }),
      db.event.findMany({
        where: upcomingEventWhere(bounds),
        include: {
          mantas: true,
          _count: { select: { participations: true } },
        },
        take: 4,
        orderBy: { date: 'asc' },
      }),
      db.event.findMany({
        where: eventOverlappingWhere(bounds.startOfDay, endOfWeek),
        select: { id: true, titre: true, eventType: true },
      }),
      db.talent.count(),
      activeStage ? loadStageStats(db, activeStage.id) : null,
    ]);

    // Workspace alerts depend on the resolved week window, so they trail the
    // wave. The active stage may sit outside that window (upcoming-in-30-days);
    // pull it in so its overdue interviews + onboarding gaps still surface.
    const alertEventsMap = new Map(eventsInWeek.map((ev) => [ev.id, ev]));
    if (activeStage && !alertEventsMap.has(activeStage.id)) {
      const stageEvent = await db.event.findUnique({
        where: { id: activeStage.id },
        select: { id: true, titre: true, eventType: true },
      });
      if (stageEvent) alertEventsMap.set(stageEvent.id, stageEvent);
    }

    const tasks = await deriveWorkspaceAlerts(
      db,
      Array.from(alertEventsMap.values()),
      { basePath: '/staff/dev', bounds },
    );

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

/**
 * Stage KPI counts for the dashboard hero: interviews done/planned and charter
 * compliance against total participations. Extracted so the four counts stay a
 * single inner Promise.all that the dashboard load can drop into its outer wave
 * as one unit.
 */
async function loadStageStats(db: ScopedPrismaClient, stageId: string) {
  const [
    completedInterviews,
    plannedInterviews,
    totalParticipations,
    chartesSigned,
  ] = await Promise.all([
    db.interview.count({
      where: { status: 'completed', participation: { eventId: stageId } },
    }),
    db.interview.count({
      where: { status: 'planned', participation: { eventId: stageId } },
    }),
    db.participation.count({ where: { eventId: stageId } }),
    db.participation.count({
      where: { eventId: stageId, ...rulesCompliantWhere },
    }),
  ]);
  return {
    completedInterviews,
    plannedInterviews,
    totalParticipations,
    chartesSigned,
  };
}

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
