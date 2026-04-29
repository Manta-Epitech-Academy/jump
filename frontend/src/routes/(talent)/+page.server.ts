import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { now } from '@internationalized/date';
import { prisma } from '$lib/server/db';
import { getBrowserTimezone } from '$lib/server/db/scoped';
import { getStartOfDay, tallyTopThemesFromActivities } from '$lib/utils';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  // Redirect to welcome page if talent hasn't seen it yet
  if (!locals.talent.welcomeSeenAt) {
    const participation = await prisma.participation.findFirst({
      where: { talentId: locals.talent.id },
      orderBy: { event: { date: 'desc' } },
      select: { campusId: true },
    });
    if (participation) {
      const welcomePage = await prisma.cmsPage.findUnique({
        where: {
          slug_campusId: { slug: 'welcome', campusId: participation.campusId },
        },
      });
      if (welcomePage?.content) {
        throw redirect(303, resolve('/welcome'));
      }
    }
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

    // Fetch all completed participations to build themes + past preview
    const allCompleted = await prisma.participation.findMany({
      where: {
        talentId: studentId,
        isPresent: true,
      },
      include: {
        event: true,
        activities: {
          include: {
            activity: {
              include: {
                activityThemes: { include: { theme: true } },
              },
            },
          },
        },
      },
    });

    // Tally top themes from completed participations
    const topThemes = tallyTopThemesFromActivities(allCompleted, 3);

    // Derive past participations from the set we already have
    const allPast = allCompleted
      .filter((p) => p.event.date < filterDateStartDate)
      .sort((a, b) => b.event.date.getTime() - a.event.date.getTime());

    const pastPreview = allPast;

    // Count missions (activities excluding orga), not participations
    const totalPastMissions = allPast.reduce(
      (sum, p) =>
        sum +
        p.activities.filter((pa) => pa.activity.activityType !== 'orga').length,
      0,
    );

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

    return {
      student: locals.talent,
      participation: todayParticipation,
      completedActivityIds: [...completedActivityIds],
      upcomingParticipation,
      pastParticipations: pastPreview,
      totalPastMissions,
      hasCompletedEvents: allCompleted.length > 0,
      topThemes,
      todayIsMultiDay,
      upcomingIsMultiDay,
      serverNow: Date.now(),
    };
  } catch (err) {
    console.error('Error fetching camper dashboard data:', err);
    throw error(500, 'Erreur lors du chargement du dashboard');
  }
};
