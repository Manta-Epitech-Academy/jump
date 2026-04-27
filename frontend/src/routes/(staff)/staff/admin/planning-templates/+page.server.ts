import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { planningTemplateSchema } from '$lib/validation/planningTemplates';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async () => {
  const planningTemplates = await prisma.planningTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { days: true } },
      days: {
        include: {
          _count: { select: { slots: true } },
        },
      },
    },
  });

  const templates = planningTemplates.map((pt) => ({
    ...pt,
    totalSlots: pt.days.reduce((sum, d) => sum + d._count.slots, 0),
  }));

  const form = await superValidate(zod4(planningTemplateSchema));

  return { templates, form };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await superValidate(request, zod4(planningTemplateSchema));
    if (!form.valid) return fail(400, { form });

    try {
      await prisma.planningTemplate.create({
        data: {
          nom: form.data.nom,
          description: form.data.description || null,
          nbDays: form.data.nbDays,
          days: {
            create: Array.from({ length: form.data.nbDays }, (_, i) => ({
              dayIndex: i,
              label: `Jour ${i + 1}`,
            })),
          },
        },
      });

      return message(form, 'Modèle de planning créé !');
    } catch (err) {
      console.error(err);
      if (
        err instanceof Error &&
        err.message.includes('Unique constraint failed')
      ) {
        return message(form, 'Un modèle avec ce nom existe déjà.', {
          status: 400,
        });
      }
      return message(form, 'Erreur lors de la création.', { status: 500 });
    }
  },

  update: async ({ request }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(planningTemplateSchema));
    const id = formData.get('id') as string;

    if (!form.valid || !id) return fail(400, { form });

    try {
      const existing = await prisma.planningTemplate.findUniqueOrThrow({
        where: { id },
      });

      await prisma.$transaction(async (tx) => {
        await tx.planningTemplate.update({
          where: { id },
          data: {
            nom: form.data.nom,
            description: form.data.description || null,
            nbDays: form.data.nbDays,
          },
        });

        // Adjust days if nbDays changed
        if (form.data.nbDays > existing.nbDays) {
          await tx.planningTemplateDay.createMany({
            data: Array.from(
              { length: form.data.nbDays - existing.nbDays },
              (_, i) => ({
                planningTemplateId: id,
                dayIndex: existing.nbDays + i,
                label: `Jour ${existing.nbDays + i + 1}`,
              }),
            ),
          });
        } else if (form.data.nbDays < existing.nbDays) {
          await tx.planningTemplateDay.deleteMany({
            where: {
              planningTemplateId: id,
              dayIndex: { gte: form.data.nbDays },
            },
          });
        }
      });

      return message(form, 'Modèle mis à jour !');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la modification.', { status: 500 });
    }
  },

  delete: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await prisma.planningTemplate.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },
};
