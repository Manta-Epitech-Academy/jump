import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { generateTalentOtp } from '$lib/server/services/talentOtp';

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
            verdictAuthor: { include: { user: true } },
          },
        },
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

    const interests = await prisma.talentInterest.findMany({
      where: { talentId: params.id },
      include: {
        interest: true,
      },
      orderBy: { interest: { order: 'asc' } },
    });

    return {
      student,
      participations,
      stats,
      sortedThemes,
      interests,
      timezone: getCampusTimezone(locals),
    };
  } catch (e) {
    console.error('Erreur chargement profil pédago:', e);
    throw error(404, 'Talent introuvable');
  }
};

export const actions: Actions = {
  generateOtp: async ({ params, locals }) => {
    requireStaffGroup(locals, 'pedaMember');
    const db = scopedPrisma(getCampusId(locals));

    // Same visibility gate as `load`: a manta can only mint an OTP for a
    // talent that participates in one of their assigned events. Peda sees
    // every talent within their campus.
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
    } else {
      // Campus-scope check so a peda can't mint for another campus's talent.
      await db.talent.findUniqueOrThrow({
        where: { id: params.id },
        select: { id: true },
      });
    }

    try {
      const result = await generateTalentOtp(params.id);
      console.log(
        `[otp] staff=${locals.user!.id} minted sign-in OTP for talent=${params.id}`,
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inattendue';
      return fail(400, { message });
    }
  },
};
