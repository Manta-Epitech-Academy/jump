import type { Actions, PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { now } from '@internationalized/date';
import { prisma } from '$lib/server/db';
import { getBrowserTimezone } from '$lib/server/db/scoped';
import { env } from '$env/dynamic/private';
import { getStartOfDay } from '$lib/utils';
import {
  checkTalentEligibility,
  getCampusLeaderboardPreview,
  getActivePublication,
  getClosestEventForTalent,
} from '$lib/server/services/minigameService';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  try {
    const studentId = locals.talent.id;

    // Calculate boundaries for "Today" in the user's browser timezone
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

    // Fetch participations for today with full planning chain.
    // Match single-day events happening today AND multi-day events whose span
    // covers today (event.date <= today <= event.endDate).
    const participations = await prisma.participation.findMany({
      where: {
        talentId: studentId,
        event: {
          date: { lte: filterDateEnd },
          OR: [
            { endDate: { gte: filterDateStartDate } },
            { endDate: null, date: { gte: filterDateStartDate } },
          ],
        },
      },
      include: {
        event: {
          include: {
            planning: {
              include: {
                timeSlots: {
                  where: {
                    activity: { activityType: { not: 'orga' } },
                    startTime: {
                      gte: filterDateStartDate,
                      lte: filterDateEnd,
                    },
                  },
                  include: { activity: true },
                  orderBy: { startTime: 'asc' },
                },
              },
            },
          },
        },
      },
      orderBy: { event: { date: 'asc' } },
    });

    // Fetch the NEXT upcoming participation (if any)
    const upcomingParticipation = await prisma.participation.findFirst({
      where: {
        talentId: studentId,
        event: { date: { gt: filterDateEnd } },
      },
      include: {
        event: true,
      },
      orderBy: { event: { date: 'asc' } },
    });

    // Count past missions (present activities excluding orga, before today).
    // Only the tally feeds the dashboard now — the history route owns the full
    // list — so count in SQL rather than fetching every participation to size it.
    const totalPastMissions = await prisma.participationActivity.count({
      where: {
        participation: {
          talentId: studentId,
          isPresent: true,
          event: { date: { lt: filterDateStartDate } },
        },
        activity: { activityType: { not: 'orga' } },
      },
    });

    // If there are multiple event today, grab the first one
    const todayParticipation =
      participations.length > 0 ? participations[0] : null;

    // Fetch completion status for today's activities
    const completedActivityIds: Set<string> = new Set();
    if (todayParticipation?.event) {
      const progressRecords = await prisma.stepsProgress.findMany({
        where: {
          talentId: studentId,
          eventId: todayParticipation.event.id,
          activityId: { not: null },
          status: 'completed',
        },
        select: { activityId: true },
      });
      for (const p of progressRecords) {
        if (p.activityId) completedActivityIds.add(p.activityId);
      }
    }

    const isMultiDay = (
      event:
        | {
            date: Date;
            endDate: Date | null;
          }
        | null
        | undefined,
    ): boolean => {
      if (!event?.endDate) return false;
      const a = new Date(event.date);
      const b = new Date(event.endDate);
      return (
        a.getFullYear() !== b.getFullYear() ||
        a.getMonth() !== b.getMonth() ||
        a.getDate() !== b.getDate()
      );
    };
    const todayIsMultiDay = isMultiDay(todayParticipation?.event);
    const upcomingIsMultiDay = isMultiDay(upcomingParticipation?.event);

    // Minigames are intrinsic but require the games backend to be wired up.
    // No backend configured → no card (can't play). An absent/already-played
    // publication is handled downstream by checkTalentEligibility.
    const minigame = env.JUMP_GAMES_URL
      ? await checkTalentEligibility(studentId)
      : null;

    // Once the daily game is done, surface a compact campus leaderboard on the
    // dashboard (the full board keeps its own page). Campus scope comes from
    // the attempt's snapshot, so this needs no extra event lookup.
    const leaderboard =
      minigame && !minigame.ok && minigame.reason === 'already_played'
        ? {
            publicationId: minigame.publication!.id,
            ...(await getCampusLeaderboardPreview(
              minigame.publication!.id,
              minigame.lastAttempt?.campusId ?? null,
              studentId,
            )),
          }
        : null;

    // The stage welcome message is the seed item of the dashboard's Actualités
    // feed. It shows for the whole stage window — the message permanently lives
    // here, this is its only home (the standalone /welcome page was removed).
    let welcome: { content: string } | null = null;
    {
      const stageParticipation = await prisma.participation.findFirst({
        where: {
          talentId: studentId,
          event: { eventType: 'stage_seconde' },
        },
        orderBy: { event: { date: 'desc' } },
        select: { event: { select: { id: true, endDate: true, date: true } } },
      });
      if (stageParticipation) {
        const stageEnd =
          stageParticipation.event.endDate ?? stageParticipation.event.date;
        if (stageEnd >= new Date()) {
          const welcomePage = await prisma.cmsPage.findUnique({
            where: {
              slug_eventId: {
                slug: 'welcome',
                eventId: stageParticipation.event.id,
              },
            },
            select: { content: true },
          });
          if (welcomePage?.content) welcome = { content: welcomePage.content };
        }
      }
    }

    return {
      student: locals.talent,
      participation: todayParticipation,
      completedActivityIds: [...completedActivityIds],
      upcomingParticipation,
      totalPastMissions,
      todayIsMultiDay,
      upcomingIsMultiDay,
      serverNow: Date.now(),
      minigame,
      leaderboard,
      welcome,
    };
  } catch (err) {
    console.error('Error fetching camper dashboard data:', err);
    throw error(500, 'Erreur lors du chargement du dashboard');
  }
};

export const actions: Actions = {
  /**
   * Dev-only shortcut to toggle today's minigame attempt without playing it or
   * editing the DB by hand: finalizes the attempt (→ "déjà joué") if not done,
   * or deletes it (→ rejouable) if done. Compiled out of production builds via
   * the `dev` guard.
   */
  devToggleMinigame: async ({ locals }) => {
    if (!dev) throw error(404, 'Indisponible.');
    if (!locals.talent) throw error(401, 'Non autorisé');

    const publication = await getActivePublication();
    if (!publication) return { toggled: false };

    const talentId = locals.talent.id;
    const where = {
      talentId_publicationId: { talentId, publicationId: publication.id },
    };
    const existing = await prisma.minigameAttempt.findUnique({ where });

    if (existing && existing.status !== 'pending') {
      await prisma.minigameAttempt.delete({ where: { id: existing.id } });
      return { toggled: true, played: false };
    }

    const closest = await getClosestEventForTalent(talentId);
    const data = {
      status: 'done' as const,
      valid: true,
      score: Math.floor(Math.random() * 1000),
      chrono: Math.floor(Math.random() * 60_000) + 5_000,
      finishedAt: new Date(),
      eventId: closest?.eventId ?? null,
      campusId: closest?.campusId ?? null,
    };
    await prisma.minigameAttempt.upsert({
      where,
      update: data,
      create: {
        talentId,
        publicationId: publication.id,
        jti: `dev-${crypto.randomUUID()}`,
        ...data,
      },
    });
    return { toggled: true, played: true };
  },
};
