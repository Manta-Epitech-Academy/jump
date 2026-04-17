import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { templateSchema } from '$lib/validation/templates';
import { prisma } from '$lib/server/db';
import { processOfficialThemes } from '$lib/server/services/themes';

export const load: PageServerLoad = async () => {
  const [templates, themes] = await Promise.all([
    prisma.activityTemplate.findMany({
      where: { campusId: null },
      orderBy: { createdAt: 'desc' },
      include: { activityTemplateThemes: { include: { theme: true } } },
    }),
    prisma.theme.findMany({
      where: { campusId: null },
      orderBy: { nom: 'asc' },
    }),
  ]);

  const form = await superValidate(zod4(templateSchema));

  return { templates, themes, form };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await superValidate(request, zod4(templateSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const themeIds = await processOfficialThemes(form.data.themes);
      const isDynamic = form.data.isDynamic as boolean;
      const contentStructure =
        isDynamic && form.data.contentStructure
          ? JSON.parse(form.data.contentStructure)
          : null;
      const content =
        !isDynamic && form.data.content ? form.data.content : null;

      await prisma.activityTemplate.create({
        data: {
          nom: form.data.nom,
          description: form.data.description || null,
          difficulte: form.data.difficulte || null,
          activityType: form.data.activityType,
          isDynamic,
          defaultDuration: form.data.defaultDuration || null,
          link: form.data.link || null,
          content,
          contentStructure,
          campusId: null,
          activityTemplateThemes: {
            create: themeIds.map((themeId) => ({ themeId })),
          },
        },
      });

      return message(form, 'Template officiel publié !');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la création', { status: 500 });
    }
  },

  update: async ({ request }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(templateSchema));
    const id = formData.get('id') as string;

    if (!form.valid || !id) return fail(400, { form });

    try {
      const themeIds = await processOfficialThemes(form.data.themes);
      const isDynamic = form.data.isDynamic as boolean;
      const contentStructure =
        isDynamic && form.data.contentStructure
          ? JSON.parse(form.data.contentStructure)
          : null;
      const content =
        !isDynamic && form.data.content ? form.data.content : null;

      await prisma.activityTemplate.update({
        where: { id },
        data: {
          nom: form.data.nom,
          description: form.data.description || null,
          difficulte: form.data.difficulte || null,
          activityType: form.data.activityType,
          isDynamic,
          defaultDuration: form.data.defaultDuration || null,
          link: form.data.link || null,
          content,
          contentStructure,
          activityTemplateThemes: {
            deleteMany: {},
            create: themeIds.map((themeId) => ({ themeId })),
          },
        },
      });

      return message(form, 'Template officiel mis à jour !');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la modification', { status: 500 });
    }
  },

  delete: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await prisma.activityTemplate.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },
};
