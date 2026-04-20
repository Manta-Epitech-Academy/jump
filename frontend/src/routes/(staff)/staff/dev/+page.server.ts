import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { now, CalendarDateTime } from '@internationalized/date';
import { EventService } from '$lib/server/services/events';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';

export const load: PageServerLoad = async ({ locals, parent }) => {
  if (!locals.user) {
    throw error(401, 'Authentification requise');
  }

  try {
    const { activeStage } = await parent();
    const db = scopedPrisma(getCampusId(locals));
    const tz = getCampusTimezone(locals);
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

    const ongoingEvents = await db.event.findMany({
      where: {
        date: { gte: startOfDay, lte: endOfDay },
      },
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
      where: { date: { gt: endOfDay } },
      include: {
        mantas: true,
        _count: { select: { participations: true } },
      },
      take: 4,
      orderBy: { date: 'asc' },
    });

    const eventsInWeek = await db.event.findMany({
      where: { date: { gte: startOfDay, lte: endOfWeek } },
      include: {
        mantas: { select: { staffProfileId: true } },
        planning: { include: { _count: { select: { timeSlots: true } } } },
      },
    });

    const eventsMissingMantas = eventsInWeek.filter(
      (ev) => ev.mantas.length === 0,
    );
    const eventsMissingPlanning = eventsInWeek.filter(
      (ev) => !ev.planning || ev.planning._count.timeSlots === 0,
    );

    const stageInterviewWhere = activeStage
      ? { participation: { eventId: activeStage.id } }
      : null;

    const interviewsToday = stageInterviewWhere
      ? await db.interview.count({
          where: {
            ...stageInterviewWhere,
            status: 'planned',
            date: { gte: startOfDay, lte: endOfDay },
          },
        })
      : 0;
    const overdueInterviews = stageInterviewWhere
      ? await db.interview.count({
          where: {
            ...stageInterviewWhere,
            status: 'planned',
            date: { lt: startOfDay },
          },
        })
      : 0;

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
      tasks: {
        eventsMissingMantas: eventsMissingMantas.map((ev) => ({
          id: ev.id,
          titre: ev.titre,
          date: ev.date,
        })),
        eventsMissingPlanning: eventsMissingPlanning.map((ev) => ({
          id: ev.id,
          titre: ev.titre,
          date: ev.date,
        })),
        interviewsToday,
        overdueInterviews,
      },
    };
  } catch (err) {
    console.error('Erreur load dashboard:', err);
    throw error(500, 'Erreur chargement dashboard');
  }
};

export const actions: Actions = {
  deleteEvent: async ({ url, locals }) => {
    requireStaffGroup(locals, 'devLead');
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await EventService.deleteEvent(id, getCampusId(locals));
      return { success: true };
    } catch (err) {
      console.error('Erreur suppression événement:', err);
      return fail(500, { message: 'Erreur lors de la suppression' });
    }
  },

  duplicateEvent: async ({ request, locals }) => {
    requireStaffGroup(locals, 'devLead');
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
