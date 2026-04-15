import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
  planningTemplateDaySchema,
  planningTemplateSlotSchema,
  planningTemplateSlotItemSchema,
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
              items: {
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
  const itemForm = await superValidate(zod4(planningTemplateSlotItemSchema));

  return { planningTemplate, activityTemplates, dayForm, slotForm, itemForm };
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
      // Get current max sortOrder for this day
      const lastSlot = await prisma.planningTemplateSlot.findFirst({
        where: { planningTemplateDayId: form.data.planningTemplateDayId },
        orderBy: { sortOrder: 'desc' },
      });

      await prisma.planningTemplateSlot.create({
        data: {
          planningTemplateDayId: form.data.planningTemplateDayId,
          startTime: form.data.startTime,
          endTime: form.data.endTime,
          label: form.data.label || null,
          sortOrder: (lastSlot?.sortOrder ?? -1) + 1,
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
          label: form.data.label || null,
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

  addItem: async ({ request }) => {
    const form = await superValidate(
      request,
      zod4(planningTemplateSlotItemSchema),
    );
    if (!form.valid) return fail(400, { form });

    try {
      const data: {
        planningTemplateSlotId: string;
        activityTemplateId?: string;
        nom?: string;
        description?: string;
        activityType?: 'atelier' | 'conference' | 'quiz' | 'orga' | 'special';
      } = {
        planningTemplateSlotId: form.data.planningTemplateSlotId,
      };

      if (form.data.activityTemplateId) {
        data.activityTemplateId = form.data.activityTemplateId;
      } else {
        data.nom = form.data.nom || 'Activité sans nom';
        data.description = form.data.description || undefined;
        data.activityType = form.data.activityType || 'orga';
      }

      await prisma.planningTemplateSlotItem.create({ data });

      return message(form, 'Activité ajoutée au créneau !');
    } catch (err) {
      console.error(err);
      return message(form, "Erreur lors de l'ajout.", { status: 500 });
    }
  },

  removeItem: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await prisma.planningTemplateSlotItem.delete({ where: { id } });
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
        include: {
          slots: {
            orderBy: { sortOrder: 'asc' },
            include: { items: true },
          },
        },
      });

      await prisma.$transaction(async (tx) => {
        // Clear target day slots
        await tx.planningTemplateSlot.deleteMany({
          where: { planningTemplateDayId: targetDayId },
        });

        // Clone slots + items
        for (const slot of sourceDay.slots) {
          await tx.planningTemplateSlot.create({
            data: {
              planningTemplateDayId: targetDayId,
              startTime: slot.startTime,
              endTime: slot.endTime,
              label: slot.label,
              sortOrder: slot.sortOrder,
              items: {
                create: slot.items.map((item) => ({
                  activityTemplateId: item.activityTemplateId,
                  nom: item.nom,
                  description: item.description,
                  activityType: item.activityType,
                })),
              },
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
