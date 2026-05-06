import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { prisma } from '$lib/server/db';

const interestSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis').trim(),
  emoji: z.string().optional().or(z.literal('')),
});

export const load: PageServerLoad = async () => {
  const interests = await prisma.interest.findMany({
    orderBy: { order: 'asc' },
    include: { _count: { select: { talentInterests: true } } },
  });

  const form = await superValidate(zod4(interestSchema));

  return { interests, form };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await superValidate(request, zod4(interestSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const maxOrder = await prisma.interest.aggregate({
        _max: { order: true },
      });
      await prisma.interest.create({
        data: {
          nom: form.data.nom,
          emoji: form.data.emoji || null,
          order: (maxOrder._max.order ?? -1) + 1,
        },
      });
      return message(form, "Centre d'intérêt créé.");
    } catch {
      return message(form, 'Erreur lors de la création.', { status: 500 });
    }
  },

  update: async ({ request }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(interestSchema));
    const id = formData.get('id') as string;
    if (!form.valid || !id) return fail(400, { form });

    try {
      await prisma.interest.update({
        where: { id },
        data: {
          nom: form.data.nom,
          emoji: form.data.emoji || null,
        },
      });
      return message(form, "Centre d'intérêt mis à jour.");
    } catch {
      return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
    }
  },

  delete: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await prisma.interest.delete({ where: { id } });
      return { success: true };
    } catch {
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },
};
