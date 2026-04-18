import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';

export const load: PageServerLoad = async ({ params, locals }) => {
  const db = scopedPrisma(getCampusId(locals));

  if (locals.staffProfile?.staffRole === 'manta') {
    const hasSharedEvent = await db.participation.findFirst({
      where: {
        talentId: params.id,
        event: {
          mantas: { some: { staffProfileId: locals.staffProfile.id } },
        },
      },
      select: { id: true },
    });
    if (!hasSharedEvent) {
      throw error(404, 'Talent introuvable');
    }
  }

  try {
    const student = await db.talent.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        user: true,
      },
    });

    const participations = await db.participation.findMany({
      where: { talentId: student.id },
      include: {
        stageCompliance: true,
        event: {
          include: {
            mantas: { include: { staffProfile: { include: { user: true } } } },
          },
        },
        activities: {
          include: {
            activity: {
              include: { activityThemes: { include: { theme: true } } },
            },
          },
        },
        noteAuthor: { include: { user: true } },
      },
      orderBy: { event: { date: 'desc' } },
    });

    const stats = {
      totalEvents: participations.length,
      presentCount: participations.filter((p) => p.isPresent).length,
      lateCount: participations.filter((p) => p.isPresent && (p.delay || 0) > 0)
        .length,
      favoriteTheme: 'Aucun',
    };

    const themeCounts: Record<string, number> = {};
    participations.forEach((p) => {
      if (p.isPresent) {
        p.activities.forEach((pa) => {
          if (pa.activity.activityType === 'orga') return;
          pa.activity.activityThemes.forEach((at) => {
            themeCounts[at.theme.nom] = (themeCounts[at.theme.nom] || 0) + 1;
          });
        });
      }
    });

    const sortedThemes = Object.entries(themeCounts).sort(
      (a, b) => b[1] - a[1],
    );
    if (sortedThemes.length > 0) {
      stats.favoriteTheme = sortedThemes[0][0];
    }

    return {
      student,
      participations,
      stats,
      sortedThemes,
      timezone: getCampusTimezone(locals),
    };
  } catch (e) {
    console.error('Erreur chargement profil pédago:', e);
    throw error(404, 'Talent introuvable');
  }
};
