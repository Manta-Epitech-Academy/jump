import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { prisma } from '$lib/server/db';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import { INTEREST_KINDS } from '$lib/domain/interests';

const createSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis').trim(),
  emoji: z.string().optional().or(z.literal('')),
  kind: z.enum(INTEREST_KINDS),
});

const updateSchema = createSchema.omit({ kind: true });

export const load: PageServerLoad = async () => {
  const techInterests = await prisma.interest.findMany({
    where: { kind: 'tech' },
    orderBy: { order: 'asc' },
    include: { _count: { select: { talentInterests: true } } },
  });

  const generalInterests = await prisma.interest.findMany({
    where: { kind: 'general' },
    orderBy: { order: 'asc' },
    include: { _count: { select: { talentInterests: true } } },
  });

  const form = await superValidate(zod4(createSchema));

  return { techInterests, generalInterests, form };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_INTEREST_WRITE, { locals });
    const form = await superValidate(request, zod4(createSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const maxOrder = await prisma.interest.aggregate({
        where: { kind: form.data.kind },
        _max: { order: true },
      });
      await prisma.interest.create({
        data: {
          nom: form.data.nom,
          emoji: form.data.emoji || null,
          kind: form.data.kind,
          order: (maxOrder._max.order ?? -1) + 1,
        },
      });
      return message(form, "Centre d'intérêt créé.");
    } catch {
      return message(form, 'Erreur lors de la création.', { status: 500 });
    }
  },

  update: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_INTEREST_WRITE, { locals });
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(updateSchema));
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

  delete: async ({ url, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_INTEREST_WRITE, { locals });
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
