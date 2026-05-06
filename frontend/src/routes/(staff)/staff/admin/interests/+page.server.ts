import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { prisma } from '$lib/server/db';

const categorySchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').trim(),
});

const interestSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis').trim(),
  emoji: z.string().optional(),
  categoryId: z.string().cuid(),
});

export const load: PageServerLoad = async () => {
  const categories = await prisma.interestCategory.findMany({
    orderBy: { order: 'asc' },
    include: {
      interests: {
        orderBy: { order: 'asc' },
        include: {
          _count: { select: { talentInterests: true } },
        },
      },
      _count: { select: { interests: true } },
    },
  });

  const categoryForm = await superValidate(zod4(categorySchema));
  const interestForm = await superValidate(zod4(interestSchema));

  return { categories, categoryForm, interestForm };
};

export const actions: Actions = {
  createCategory: async ({ request }) => {
    const form = await superValidate(request, zod4(categorySchema));
    if (!form.valid) return fail(400, { categoryForm: form });

    try {
      const maxOrder = await prisma.interestCategory.aggregate({
        _max: { order: true },
      });
      const order = (maxOrder._max.order ?? -1) + 1;

      await prisma.interestCategory.create({
        data: { nom: form.data.nom, order },
      });
      return message(form, 'Catégorie créée.');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la création de la catégorie.', {
        status: 500,
      });
    }
  },

  updateCategory: async ({ request }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(categorySchema));
    const id = formData.get('id') as string;

    if (!form.valid || !id) return fail(400, { categoryForm: form });

    try {
      await prisma.interestCategory.update({
        where: { id },
        data: { nom: form.data.nom },
      });
      return message(form, 'Catégorie mise à jour.');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
    }
  },

  deleteCategory: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await prisma.interestCategory.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },

  createInterest: async ({ request }) => {
    const form = await superValidate(request, zod4(interestSchema));
    if (!form.valid) return fail(400, { interestForm: form });

    try {
      const maxOrder = await prisma.interest.aggregate({
        where: { categoryId: form.data.categoryId },
        _max: { order: true },
      });
      const order = (maxOrder._max.order ?? -1) + 1;

      await prisma.interest.create({
        data: {
          nom: form.data.nom,
          emoji: form.data.emoji || null,
          categoryId: form.data.categoryId,
          order,
        },
      });
      return message(form, 'Intérêt créé.');
    } catch (err) {
      console.error(err);
      return message(form, "Erreur lors de la création de l'intérêt.", {
        status: 500,
      });
    }
  },

  updateInterest: async ({ request }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(interestSchema));
    const id = formData.get('id') as string;

    if (!form.valid || !id) return fail(400, { interestForm: form });

    try {
      await prisma.interest.update({
        where: { id },
        data: {
          nom: form.data.nom,
          emoji: form.data.emoji || null,
        },
      });
      return message(form, 'Intérêt mis à jour.');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
    }
  },

  deleteInterest: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await prisma.interest.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },
};
