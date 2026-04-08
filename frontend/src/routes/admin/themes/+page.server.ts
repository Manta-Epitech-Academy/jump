import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { prisma } from '$lib/server/db';

const themeSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').trim(),
});

export const load: PageServerLoad = async () => {
  // Load only global themes (null campus = official)
  const themes = await prisma.theme.findMany({
    where: { campusId: null },
    orderBy: { nom: 'asc' },
  });

  const form = await superValidate(zod4(themeSchema));

  return { themes, form };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await superValidate(request, zod4(themeSchema));
    if (!form.valid) return fail(400, { form });

    try {
      // Creation with null campus (Official Theme)
      await prisma.theme.create({
        data: { nom: form.data.nom, campusId: null },
      });
      return message(form, 'Thème officiel créé.');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la création du thème.', {
        status: 500,
      });
    }
  },

  update: async ({ request }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(themeSchema));
    const id = formData.get('id') as string;

    if (!form.valid || !id) return fail(400, { form });

    try {
      await prisma.theme.update({
        where: { id },
        data: { nom: form.data.nom },
      });
      return message(form, 'Thème mis à jour.');
    } catch (err) {
      return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
    }
  },

  delete: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      // SECURITY : Check if the theme is used in a subject or an event
      const [usedInSubjects, usedInEvents] = await Promise.all([
        prisma.subjectTheme.count({ where: { themeId: id } }),
        prisma.event.count({ where: { themeId: id } }),
      ]);

      if (usedInSubjects > 0 || usedInEvents > 0) {
        return fail(400, {
          message: `Suppression bloquée : Ce thème est utilisé par ${usedInSubjects} sujet(s) et ${usedInEvents} événement(s).`,
        });
      }

      await prisma.theme.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },
};
