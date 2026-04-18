import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { studentSchema } from '$lib/validation/students';
import { scheduleInterviewSchema } from '$lib/validation/interviews';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { CalendarDateTime } from '@internationalized/date';
import { requireStaffGroup } from '$lib/server/auth/guards';

const scheduleInterviewFromStudentSchema = scheduleInterviewSchema.omit({
  talentId: true,
});

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
    const scheduleInterviewForm = await superValidate(
      zod4(scheduleInterviewFromStudentSchema),
    );

    return {
      student,
      participations,
      stats,
      form,
      scheduleInterviewForm,
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
          parentEmail: form.data.parent_email || null,
          parentPhone: form.data.parent_phone || null,
          phone: form.data.phone || null,
        },
      });
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

  scheduleInterview: async ({ request, params, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(
      request,
      zod4(scheduleInterviewFromStudentSchema),
    );
    if (!form.valid) return fail(400, { form });

    const staffId = locals.staffProfile?.id;
    if (!staffId) return fail(403, { form });

    const [year, month, day] = form.data.date.split('-').map(Number);
    const [hour, minute] = form.data.time.split(':').map(Number);
    const cdt = new CalendarDateTime(year, month, day, hour, minute);

    try {
      const campusId = getCampusId(locals);
      const db = scopedPrisma(campusId);
      await db.interview.create({
        data: {
          talentId: params.id,
          campusId,
          staffId,
          date: cdt.toDate(getCampusTimezone(locals)),
          status: 'planned',
        },
      });
      return message(form, 'Entretien planifié !');
    } catch (err) {
      console.error('scheduleInterview failed', err);
      return message(form, "Erreur lors de la planification de l'entretien.", {
        status: 500,
      });
    }
  },
};
