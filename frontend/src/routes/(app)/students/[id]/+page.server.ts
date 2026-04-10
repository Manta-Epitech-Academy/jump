import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { studentSchema } from '$lib/validation/students';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';

export const load: PageServerLoad = async ({ params, locals }) => {
  const db = scopedPrisma(getCampusId(locals));
  try {
    const student = await db.studentProfile.findUniqueOrThrow({
      where: { id: params.id },
      include: { user: true, campus: true },
    });

    const participations = await prisma.participation.findMany({
      where: { studentProfileId: student.id },
      include: {
        event: {
          include: {
            mantas: { include: { staffProfile: { include: { user: true } } } },
          },
        },
        subjects: {
          include: {
            subject: {
              include: { subjectThemes: { include: { theme: true } } },
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
        p.subjects.forEach((ps) => {
          ps.subject.subjectThemes.forEach((st) => {
            themeCounts[st.theme.nom] = (themeCounts[st.theme.nom] || 0) + 1;
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
    };
  } catch (e) {
    console.error('Erreur chargement élève:', e);
    throw error(404, 'Élève introuvable');
  }
};

export const actions: Actions = {
  update: async ({ request, params, locals }) => {
    const form = await superValidate(request, zod4(studentSchema));
    if (!form.valid) return fail(400, { form });
    const db = scopedPrisma(getCampusId(locals));

    try {
      await db.studentProfile.update({
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
        return message(form, 'Un élève avec ce nom et cet email existe déjà.', {
          status: 400,
        });
      }
      return message(form, 'Erreur lors de la mise à jour', { status: 500 });
    }
  },

  delete: async ({ params, locals }) => {
    const db = scopedPrisma(getCampusId(locals));
    try {
      const profile = await db.studentProfile.findUniqueOrThrow({
        where: { id: params.id },
      });
      await prisma.bauth_user.delete({ where: { id: profile.userId } });
    } catch (err) {
      console.error('Error deleting student:', err);
      return fail(500, { message: 'Impossible de supprimer cet élève' });
    }
    throw redirect(303, resolve('/students'));
  },
};
