import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import {
  addDays,
  fromWallClock,
  toDateKey,
  toWallClockTime,
} from '$lib/domain/planningTime';

/**
 * Apply a PlanningTemplate to an event, creating all TimeSlots and Activities.
 * Replaces any existing planning content for the event.
 *
 * Each PlanningTemplateSlot maps 1:1 to a TimeSlot+Activity pair.
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
            orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }],
            include: {
              activityTemplate: {
                include: { activityTemplateThemes: true },
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

  // Day 0 of the template aligns with the event's calendar day in the campus
  // timezone. Going through DateKey strings (rather than Date arithmetic) keeps
  // multi-day templates DST-safe — `addDays` increments the calendar field, so
  // a +1 day across a DST switch still lands on the next calendar day.
  const eventDateKey = toDateKey(event.date, timezone);

  await prisma.$transaction(async (tx) => {
    const planning = await tx.planning.upsert({
      where: { eventId },
      create: { eventId },
      update: {},
    });

    await tx.timeSlot.deleteMany({ where: { planningId: planning.id } });

    for (const day of template.days) {
      const dayKey = addDays(eventDateKey, day.dayIndex);

      for (const slot of day.slots) {
        const timeSlot = await tx.timeSlot.create({
          data: {
            planningId: planning.id,
            startTime: fromWallClock(dayKey, slot.startTime, timezone),
            endTime: fromWallClock(dayKey, slot.endTime, timezone),
          },
        });

        if (slot.activityTemplate) {
          const at = slot.activityTemplate;
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
              subjectVersionId: at.subjectVersionId,
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
        } else {
          await tx.activity.create({
            data: {
              nom: slot.nom || 'Pause',
              description: slot.description,
              activityType: slot.activityType,
              isDynamic: false,
              timeSlotId: timeSlot.id,
            },
          });
        }
      }
    }

    if (template.nbDays > 1) {
      // Preserve the event's wall-clock start time on the last day, matching
      // the previous semantics (endDate = event start time + N calendar days).
      const lastDayKey = addDays(eventDateKey, template.nbDays - 1);
      const eventTime = toWallClockTime(event.date, timezone);
      await tx.event.update({
        where: { id: eventId },
        data: { endDate: fromWallClock(lastDayKey, eventTime, timezone) },
      });
    }
  });
}
