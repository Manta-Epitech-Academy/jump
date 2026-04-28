import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { studentSchema } from '$lib/validation/students';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);
  try {
    const student = await db.talent.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        user: true,
        interviews: {
          where: { campusId },
          include: { staff: { include: { user: true } } },
          orderBy: { date: 'desc' },
        },
      },
    });

    const participations = await db.participation.findMany({
      where: { talentId: student.id },
      include: {
        stageCompliance: true,
        interview: true,
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

    const form = await superValidate(zod4(studentSchema));

    return {
      student,
      participations,
      stats,
      form,
      timezone: getCampusTimezone(locals),
    };
  } catch (e) {
    console.error('Erreur chargement Talent:', e);
    throw error(404, 'Talent introuvable');
  }
};

export const actions: Actions = {
  update: async ({ request, params, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(studentSchema));
    if (!form.valid) return fail(400, { form });
    const db = scopedPrisma(getCampusId(locals));

    try {
      await db.talent.update({
        where: { id: params.id },
        data: {
          nom: form.data.nom,
          prenom: form.data.prenom,
          niveau: form.data.niveau || null,
          niveauDifficulte: form.data.niveau_difficulte || 'Débutant',
          parentEmail: form.data.parent_email
            ? form.data.parent_email.toLowerCase().trim()
            : null,
          parentPhone: form.data.parent_phone || null,
          phone: form.data.phone || null,
        },
      });

      if (form.data.email) {
        const profile = await db.talent.findUniqueOrThrow({
          where: { id: params.id },
        });
        if (profile.userId) {
          await prisma.bauth_user.update({
            where: { id: profile.userId },
            data: { email: form.data.email },
          });
        }
      }

      return message(form, 'Profil mis à jour avec succès !');
    } catch (err: any) {
      if (err.code === 'P2002') {
        return message(
          form,
          'Un Talent avec ce nom et cet email existe déjà.',
          {
            status: 400,
          },
        );
      }
      return message(form, 'Erreur lors de la mise à jour', { status: 500 });
    }
  },

  delete: async ({ params, locals }) => {
    requireStaffGroup(locals, 'devLead');
    const db = scopedPrisma(getCampusId(locals));
    try {
      const profile = await db.talent.findUniqueOrThrow({
        where: { id: params.id },
      });
      if (profile.userId) {
        await prisma.bauth_user.delete({ where: { id: profile.userId } });
      } else {
        await db.talent.delete({ where: { id: params.id } });
      }
    } catch (err) {
      console.error('Error deleting student:', err);
      return fail(500, { message: 'Impossible de supprimer ce Talent' });
    }
    throw redirect(303, resolve('/staff/dev/students'));
  },
};
