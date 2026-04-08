import { prisma } from '$lib/server/db';
import { getSubjectXpValue } from './xp';
import type { Subject } from '@prisma/client';

/**
 * Pre-fetch completed subject IDs for multiple students in a single query.
 * Use this before calling suggestBestSubject in a loop to avoid N+1 queries.
 */
export async function preloadCompletedSubjects(
  studentProfileIds: string[],
  excludeEventId?: string,
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (studentProfileIds.length === 0) return map;

  for (const id of studentProfileIds) {
    map.set(id, new Set());
  }

  const participations = await prisma.participation.findMany({
    where: {
      studentProfileId: { in: studentProfileIds },
      isPresent: true,
      ...(excludeEventId ? { eventId: { not: excludeEventId } } : {}),
    },
    select: {
      studentProfileId: true,
      subjects: { select: { subjectId: true } },
    },
  });

  for (const p of participations) {
    const set = map.get(p.studentProfileId);
    if (set) {
      for (const s of p.subjects) set.add(s.subjectId);
    }
  }

  return map;
}

/**
 * Intelligent Algorithm to guess the best subject for a student.
 * 1. Matches the student's difficulty level directly.
 * 2. Excludes subjects the student has already completed (is_present).
 * 3. Prioritizes subjects matching the Event Theme.
 * 4. Prioritizes subjects with higher XP values.
 */
export async function suggestBestSubject(
  studentProfileId: string,
  subjects: (Subject & { subjectThemes?: { themeId: string }[] })[],
  eventThemeId?: string | null,
  currentSubjectIds: string[] = [],
  preloadedCompleted?: Set<string>,
): Promise<string | null> {
  try {
    const studentProfile = await prisma.studentProfile.findUniqueOrThrow({
      where: { id: studentProfileId },
    });

    const studentDifficulty = studentProfile.niveauDifficulte || 'Débutant';

    let completedSubjectIds: Set<string>;
    if (preloadedCompleted) {
      completedSubjectIds = preloadedCompleted;
    } else {
      const completedParticipations = await prisma.participation.findMany({
        where: {
          studentProfileId,
          isPresent: true,
        },
        select: {
          subjects: { select: { subjectId: true } },
        },
      });

      completedSubjectIds = new Set<string>();
      for (const p of completedParticipations) {
        for (const s of p.subjects) completedSubjectIds.add(s.subjectId);
      }
    }

    const recommendations = subjects
      .filter((sub) => {
        const difficultyMatch = sub.difficulte === studentDifficulty;
        const alreadyDone = completedSubjectIds.has(sub.id);
        const currentlyAssigned = currentSubjectIds.includes(sub.id);
        return difficultyMatch && !alreadyDone && !currentlyAssigned;
      })
      .map((sub) => {
        let score = getSubjectXpValue(sub.difficulte);

        if (
          eventThemeId &&
          sub.subjectThemes?.some((st) => st.themeId === eventThemeId)
        ) {
          score += 1000;
        }

        return { subject: sub, score };
      })
      .sort((a, b) => b.score - a.score);

    if (recommendations.length === 0 && studentDifficulty === 'Débutant') {
      const fallback = subjects.find(
        (s) =>
          s.difficulte === 'Intermédiaire' &&
          !completedSubjectIds.has(s.id) &&
          !currentSubjectIds.includes(s.id),
      );
      return fallback ? fallback.id : null;
    }

    return recommendations.length > 0 ? recommendations[0].subject.id : null;
  } catch (err) {
    console.error('Recommender error:', err);
    return null;
  }
}
