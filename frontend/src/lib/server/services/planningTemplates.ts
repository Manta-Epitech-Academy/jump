import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { CalendarDateTime } from '@internationalized/date';

/**
 * Apply a PlanningTemplate to an event, creating all TimeSlots and Activities.
 * Replaces any existing planning content for the event.
 */
export async function applyPlanningTemplate(
  planningTemplateId: string,
  eventId: string,
  campusId: string,
  timezone: string,
) {
  const template = await prisma.planningTemplate.findUniqueOrThrow({
    where: { id: planningTemplateId },
    include: {
      days: {
        orderBy: { dayIndex: 'asc' },
        include: {
          slots: {
            orderBy: { sortOrder: 'asc' },
            include: {
              items: {
                include: {
                  activityTemplate: {
                    include: { activityTemplateThemes: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
  });

  if (event.campusId !== campusId) {
    throw error(
      403,
      'Accès refusé : cet événement appartient à un autre campus.',
    );
  }

  const eventDate = new Date(event.date);

  await prisma.$transaction(async (tx) => {
    const planning = await tx.planning.upsert({
      where: { eventId },
      create: { eventId },
      update: {},
    });

    // Clear existing slots (cascades to activities)
    await tx.timeSlot.deleteMany({ where: { planningId: planning.id } });

    for (const day of template.days) {
      // Compute absolute date: event date + dayIndex days
      const dayDate = new Date(eventDate);
      dayDate.setDate(dayDate.getDate() + day.dayIndex);

      for (const slot of day.slots) {
        const [startH, startM] = slot.startTime.split(':').map(Number);
        const [endH, endM] = slot.endTime.split(':').map(Number);

        const startCdt = new CalendarDateTime(
          dayDate.getFullYear(),
          dayDate.getMonth() + 1,
          dayDate.getDate(),
          startH,
          startM,
        );
        const endCdt = new CalendarDateTime(
          dayDate.getFullYear(),
          dayDate.getMonth() + 1,
          dayDate.getDate(),
          endH,
          endM,
        );

        const timeSlot = await tx.timeSlot.create({
          data: {
            planningId: planning.id,
            startTime: startCdt.toDate(timezone),
            endTime: endCdt.toDate(timezone),
            label: slot.label,
          },
        });

        for (const item of slot.items) {
          if (item.activityTemplateId && item.activityTemplate) {
            const at = item.activityTemplate;
            await tx.activity.create({
              data: {
                nom: at.nom,
                description: at.description,
                difficulte: at.difficulte,
                activityType: at.activityType,
                isDynamic: at.isDynamic,
                link: at.link,
                content: at.content,
                contentStructure: at.contentStructure ?? undefined,
                templateId: at.id,
                timeSlotId: timeSlot.id,
                activityThemes:
                  at.activityTemplateThemes.length > 0
                    ? {
                        create: at.activityTemplateThemes.map((att) => ({
                          themeId: att.themeId,
                        })),
                      }
                    : undefined,
              },
            });
          } else if (item.nom) {
            await tx.activity.create({
              data: {
                nom: item.nom,
                description: item.description,
                activityType: item.activityType,
                isDynamic: false,
                timeSlotId: timeSlot.id,
              },
            });
          }
        }
      }
    }

    // Auto-set endDate for multi-day templates
    if (template.nbDays > 1) {
      const endDate = new Date(eventDate);
      endDate.setDate(endDate.getDate() + template.nbDays - 1);
      await tx.event.update({
        where: { id: eventId },
        data: { endDate },
      });
    }
  });
}
