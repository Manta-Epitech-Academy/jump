import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
  planningTemplateDaySchema,
  planningTemplateSlotSchema,
} from '$lib/validation/planningTemplates';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
  const planningTemplate = await prisma.planningTemplate.findUnique({
    where: { id: params.id },
    include: {
      days: {
        orderBy: { dayIndex: 'asc' },
        include: {
          slots: {
            orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }],
            include: {
              activityTemplate: {
                include: {
                  activityTemplateThemes: { include: { theme: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!planningTemplate) throw error(404, 'Modèle introuvable');

  const activityTemplates = await prisma.activityTemplate.findMany({
    where: { campusId: null },
    orderBy: { nom: 'asc' },
    include: { activityTemplateThemes: { include: { theme: true } } },
  });

  const dayForm = await superValidate(zod4(planningTemplateDaySchema));
  const slotForm = await superValidate(zod4(planningTemplateSlotSchema));

  return { planningTemplate, activityTemplates, dayForm, slotForm };
};

export const actions: Actions = {
  updateDay: async ({ request }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(planningTemplateDaySchema));
    if (!form.valid) return fail(400, { form });

    try {
      await prisma.planningTemplateDay.update({
        where: { id: form.data.dayId },
        data: { label: form.data.label || null },
      });
      return message(form, 'Jour mis à jour !');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
    }
  },

  addSlot: async ({ request }) => {
    const form = await superValidate(request, zod4(planningTemplateSlotSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const lastSlot = await prisma.planningTemplateSlot.findFirst({
        where: { planningTemplateDayId: form.data.planningTemplateDayId },
        orderBy: { sortOrder: 'desc' },
      });

      await prisma.planningTemplateSlot.create({
        data: {
          planningTemplateDayId: form.data.planningTemplateDayId,
          startTime: form.data.startTime,
          endTime: form.data.endTime,
          sortOrder: (lastSlot?.sortOrder ?? -1) + 1,
          activityTemplateId: form.data.activityTemplateId || null,
          nom: form.data.activityTemplateId
            ? null
            : form.data.nom?.trim() || null,
          description: form.data.activityTemplateId
            ? null
            : form.data.description || null,
          activityType: form.data.activityType,
        },
      });

      return message(form, 'Créneau ajouté !');
    } catch (err) {
      console.error(err);
      return message(form, "Erreur lors de l'ajout du créneau.", {
        status: 500,
      });
    }
  },

  updateSlot: async ({ request }) => {
    const formData = await request.formData();
    const slotId = formData.get('slotId') as string;
    if (!slotId) return fail(400);

    const form = await superValidate(
      formData,
      zod4(planningTemplateSlotSchema),
    );
    if (!form.valid) return fail(400, { form });

    try {
      await prisma.planningTemplateSlot.update({
        where: { id: slotId },
        data: {
          startTime: form.data.startTime,
          endTime: form.data.endTime,
          activityTemplateId: form.data.activityTemplateId || null,
          nom: form.data.activityTemplateId
            ? null
            : form.data.nom?.trim() || null,
          description: form.data.activityTemplateId
            ? null
            : form.data.description || null,
          activityType: form.data.activityType,
        },
      });

      return message(form, 'Créneau mis à jour !');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
    }
  },

  deleteSlot: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await prisma.planningTemplateSlot.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },

  duplicateDay: async ({ request }) => {
    const formData = await request.formData();
    const sourceDayId = formData.get('sourceDayId') as string;
    const targetDayId = formData.get('targetDayId') as string;
    if (!sourceDayId || !targetDayId) return fail(400);

    try {
      const sourceDay = await prisma.planningTemplateDay.findUniqueOrThrow({
        where: { id: sourceDayId },
        include: { slots: { orderBy: { sortOrder: 'asc' } } },
      });

      await prisma.$transaction(async (tx) => {
        await tx.planningTemplateSlot.deleteMany({
          where: { planningTemplateDayId: targetDayId },
        });

        for (const slot of sourceDay.slots) {
          await tx.planningTemplateSlot.create({
            data: {
              planningTemplateDayId: targetDayId,
              startTime: slot.startTime,
              endTime: slot.endTime,
              sortOrder: slot.sortOrder,
              activityTemplateId: slot.activityTemplateId,
              nom: slot.nom,
              description: slot.description,
              activityType: slot.activityType,
            },
          });
        }
      });

      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la duplication.' });
    }
  },
};
