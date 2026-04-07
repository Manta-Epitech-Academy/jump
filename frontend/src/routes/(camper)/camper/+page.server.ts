import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { now } from '@internationalized/date';
import { prisma } from '$lib/server/db';
import { getParisStartOfDay } from '$lib/utils';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.studentProfile) {
    throw error(401, 'Non autorisé');
  }

  try {
    const studentId = locals.studentProfile.id;

    // Calculate boundaries for "Today" in the user's timezone (Europe/Paris)
    const filterDateStart = getParisStartOfDay();
    const parisNow = now('Europe/Paris');
    const endOfDay = parisNow.set({
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    });
    const filterDateEnd = endOfDay.toDate();
    const filterDateStartDate = new Date(filterDateStart);

    // Fetch participations for today
    const participations = await prisma.participation.findMany({
      where: {
        studentProfileId: studentId,
        event: {
          date: {
            gte: filterDateStartDate,
            lte: filterDateEnd,
          },
        },
      },
      include: {
        event: true,
        subjects: { include: { subject: true } },
      },
      orderBy: { event: { date: 'asc' } },
    });

    // Fetch the NEXT upcoming participation (if any)
    const upcomingParticipation = await prisma.participation.findFirst({
      where: {
        studentProfileId: studentId,
        event: { date: { gt: filterDateEnd } },
      },
      include: {
        event: true,
        subjects: { include: { subject: true } },
      },
      orderBy: { event: { date: 'asc' } },
    });

    // Fetch all completed participations to build themes + past preview
    const allCompleted = await prisma.participation.findMany({
      where: {
        studentProfileId: studentId,
        isPresent: true,
      },
      include: {
        event: true,
        subjects: {
          include: {
            subject: {
              include: {
                subjectThemes: { include: { theme: true } },
              },
            },
          },
        },
      },
    });

    // Tally top themes from completed participations
    const topThemes = tallyTopThemesPrisma(allCompleted, 3);

    // Derive past participations from the set we already have
    const allPast = allCompleted
      .filter((p) => p.event.date < filterDateStartDate)
      .sort((a, b) => b.event.date.getTime() - a.event.date.getTime());

    const pastPreview = allPast;

    // Count missions (subjects), not participations, for the "Voir tout" badge
    const totalPastMissions = allPast.reduce(
      (sum, p) => sum + p.subjects.length,
      0,
    );

    // If there are multiple events today, grab the first one
    const todayParticipation =
      participations.length > 0 ? participations[0] : null;

    // Fetch completion status for today's subjects
    const completedSubjectIds: Set<string> = new Set();
    const todaySubjects = todayParticipation?.subjects ?? [];
    if (todaySubjects.length > 0 && todayParticipation?.event) {
      const progressRecords = await prisma.stepsProgress.findMany({
        where: {
          studentProfileId: studentId,
          eventId: todayParticipation.event.id,
          status: 'completed',
        },
        select: { subjectId: true },
      });
      for (const p of progressRecords) {
        completedSubjectIds.add(p.subjectId);
      }
    }

    return {
      student: locals.studentProfile,
      participation: todayParticipation,
      completedSubjectIds: [...completedSubjectIds],
      upcomingParticipation,
      pastParticipations: pastPreview,
      totalPastMissions,
      hasCompletedEvents: allCompleted.length > 0,
      topThemes,
    };
  } catch (err) {
    console.error('Error fetching camper dashboard data:', err);
    throw error(500, 'Erreur lors du chargement du dashboard');
  }
};

/* ── Theme tallying (Prisma-shaped data) ─────────────────────── */

const THEME_TIERS = [
  { min: 4, label: 'Expert' },
  { min: 2, label: 'Confirmé' },
  { min: 0, label: 'Initié' },
] as const;

function themeTierLabel(count: number): string {
  return (THEME_TIERS.find((t) => count >= t.min) ?? THEME_TIERS.at(-1)!).label;
}

function tallyTopThemesPrisma(
  participations: {
    subjects: {
      subject: {
        subjectThemes: { theme: { nom: string } }[];
      };
    }[];
  }[],
  limit: number,
): { name: string; count: number; label: string }[] {
  const tally: Record<string, number> = {};
  for (const p of participations) {
    for (const ps of p.subjects) {
      const themes = ps.subject.subjectThemes;
      if (themes.length === 0) {
        tally['Général'] = (tally['Général'] || 0) + 1;
      } else {
        for (const st of themes) {
          tally[st.theme.nom] = (tally[st.theme.nom] || 0) + 1;
        }
      }
    }
  }
  return Object.entries(tally)
    .map(([name, count]) => ({ name, count, label: themeTierLabel(count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
