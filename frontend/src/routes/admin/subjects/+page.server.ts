import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { subjectSchema } from '$lib/validation/subjects';
import { prisma } from '$lib/server/db';
import { processOfficialThemes } from '$lib/server/services/themes';

export const load: PageServerLoad = async () => {
  // Load ONLY official subjects and themes (campusId = null)
  const [subjects, themes] = await Promise.all([
    prisma.subject.findMany({
      where: { campusId: null },
      orderBy: { createdAt: 'desc' },
      include: { subjectThemes: { include: { theme: true } } },
    }),
    prisma.theme.findMany({
      where: { campusId: null },
      orderBy: { nom: 'asc' },
    }),
  ]);

  const form = await superValidate(zod4(subjectSchema));

  return { subjects, themes, form };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await superValidate(request, zod4(subjectSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const themeIds = await processOfficialThemes(form.data.themes);

      await prisma.subject.create({
        data: {
          nom: form.data.nom,
          description: form.data.description,
          difficulte: form.data.difficulte,
          link: form.data.link || null,
          campusId: null,
          subjectThemes: {
            create: themeIds.map((themeId) => ({ themeId })),
          },
        },
      });

      return message(form, 'Sujet officiel publié !');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la création', { status: 500 });
    }
  },

  update: async ({ request }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(subjectSchema));
    const id = formData.get('id') as string;

    if (!form.valid || !id) return fail(400, { form });

    try {
      const themeIds = await processOfficialThemes(form.data.themes);

      await prisma.subject.update({
        where: { id },
        data: {
          nom: form.data.nom,
          description: form.data.description,
          difficulte: form.data.difficulte,
          link: form.data.link || null,
          subjectThemes: {
            deleteMany: {},
            create: themeIds.map((themeId) => ({ themeId })),
          },
        },
      });
      return message(form, 'Sujet officiel mis à jour !');
    } catch (err) {
      return message(form, 'Erreur lors de la modification', { status: 500 });
    }
  },

  delete: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      // SECURITY : Check if the subject is present in at least one participation
      const usedInParticipations = await prisma.participationSubject.count({
        where: { subjectId: id },
      });

      if (usedInParticipations > 0) {
        return fail(400, {
          message:
            "Suppression bloquée : Ce sujet a déjà été utilisé lors d'événements. Le supprimer corromprait l'historique d'XP des élèves.",
        });
      }

      await prisma.subject.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },
};
