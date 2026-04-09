import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { subjectSchema } from '$lib/validation/subjects';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { m } from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async ({ locals }) => {
  const db = scopedPrisma(getCampusId(locals));
  const subjects = await db.subject.findMany({
    include: {
      subjectThemes: { include: { theme: true } },
      campus: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const themes = await db.theme.findMany({
    orderBy: { nom: 'asc' },
  });

  const form = await superValidate(zod4(subjectSchema));

  return { subjects, themes, form };
};

async function processThemes(
  themeNames: string[],
  campusId: string | null,
): Promise<string[]> {
  const themeIds: string[] = [];

  for (const name of themeNames) {
    if (!name.trim()) continue;

    const existing = await prisma.theme.findFirst({
      where: {
        nom: name,
        OR: [{ campusId: null }, { campusId: campusId }],
      },
    });

    if (existing) {
      themeIds.push(existing.id);
    } else {
      const created = await prisma.theme.create({
        data: { nom: name, campusId },
      });
      themeIds.push(created.id);
    }
  }

  return themeIds;
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(subjectSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const campusId = getCampusId(locals);
      const themeIds = await processThemes(form.data.themes, campusId);

      await prisma.subject.create({
        data: {
          nom: form.data.nom,
          description: form.data.description || null,
          difficulte: form.data.difficulte,
          link: form.data.link || null,
          campusId,
          subjectThemes: {
            create: themeIds.map((themeId) => ({ themeId })),
          },
        },
      });

      return message(form, m.subject_create_success());
    } catch (err) {
      console.error('Erreur création sujet:', err);
      return message(form, m.server_error_generic_create(), { status: 500 });
    }
  },

  update: async ({ request, locals }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(subjectSchema));
    const id = formData.get('id') as string;

    if (!form.valid) return fail(400, { form });
    if (!id) return message(form, m.subject_id_missing(), { status: 400 });

    try {
      const subject = await prisma.subject.findUniqueOrThrow({
        where: { id },
      });

      if (subject.campusId !== locals.staffProfile?.campusId) {
        return message(
          form,
          "Vous ne pouvez pas modifier un sujet qui n'est pas le vôtre.",
          { status: 403 },
        );
      }

      const campusId = locals.staffProfile?.campusId || null;
      const themeIds = await processThemes(form.data.themes, campusId);

      // Delete old theme associations and create new ones
      await prisma.subjectTheme.deleteMany({ where: { subjectId: id } });

      await prisma.subject.update({
        where: { id },
        data: {
          nom: form.data.nom,
          description: form.data.description || null,
          difficulte: form.data.difficulte,
          link: form.data.link || null,
          subjectThemes: {
            create: themeIds.map((themeId) => ({ themeId })),
          },
        },
      });

      return message(form, m.subject_update_success());
    } catch (err) {
      console.error('Erreur update sujet:', err);
      return message(form, m.server_error_generic_update(), { status: 500 });
    }
  },

  delete: async ({ url, locals }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      const subject = await prisma.subject.findUniqueOrThrow({
        where: { id },
      });

      if (subject.campusId !== locals.staffProfile?.campusId) {
        return fail(403, {
          message:
            "Vous ne pouvez pas supprimer un sujet qui n'est pas le vôtre.",
        });
      }

      // Check if subject is used in any participation
      const usageCount = await prisma.participationSubject.count({
        where: { subjectId: id },
      });

      if (usageCount > 0) {
        return fail(400, {
          message:
            'Impossible de supprimer le sujet car il est lié à un ou plusieurs événements.',
        });
      }

      await prisma.subjectTheme.deleteMany({ where: { subjectId: id } });
      await prisma.subject.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      console.error('Erreur suppression sujet:', err);
      return fail(500, {
        message: 'Une erreur technique est survenue lors de la suppression.',
      });
    }
  },
};
