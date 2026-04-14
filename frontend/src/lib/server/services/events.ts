import { error } from '@sveltejs/kit';
import { getTotalXp, getXpEligibleActivities } from '$lib/domain/xp';
import { generatePin } from '$lib/utils';
import { prisma } from '$lib/server/db';

export const EventService = {
  /**
   * Deletes an event and automatically rolls back XP for all present students.
   * Verifies the event belongs to the given campus before proceeding.
   */
  async deleteEvent(eventId: string, campusId: string) {
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { campusId: true },
    });
    if (event.campusId !== campusId) {
      throw error(
        403,
        'Accès refusé : cet événement appartient à un autre campus.',
      );
    }

    await prisma.$transaction(async (tx) => {
      const participations = await tx.participation.findMany({
        where: { eventId, isPresent: true },
        include: {
          activities: { include: { activity: true } },
        },
      });

      for (const p of participations) {
        const xpValue = getTotalXp(getXpEligibleActivities(p.activities));

        const profile = await tx.talent.findUniqueOrThrow({
          where: { id: p.talentId },
          select: { xp: true, eventsCount: true },
        });
        await tx.talent.update({
          where: { id: p.talentId },
          data: {
            xp: Math.max(0, profile.xp - xpValue),
            eventsCount: Math.max(0, profile.eventsCount - 1),
          },
        });
      }

      // All related records (participations, activities, mantas, progress, portfolio)
      // are cascade-deleted by PostgreSQL foreign keys.
      await tx.event.delete({ where: { id: eventId } });
    });
  },

  /**
   * Duplicates an event and its participants (resetting status).
   */
  async duplicateEvent(
    originalId: string,
    newData: { titre: string; date: string },
    campusId: string,
  ) {
    const original = await prisma.event.findUniqueOrThrow({
      where: { id: originalId },
      include: {
        mantas: true,
        participations: true,
      },
    });
    if (original.campusId !== campusId) {
      throw error(
        403,
        'Accès refusé : cet événement appartient à un autre campus.',
      );
    }

    const pin = generatePin();

    const newEvent = await prisma.event.create({
      data: {
        titre: newData.titre,
        date: new Date(newData.date),
        themeId: original.themeId,
        campusId,
        pin,
        mantas: {
          create: original.mantas.map((m) => ({
            staffProfileId: m.staffProfileId,
          })),
        },
      },
    });

    for (const p of original.participations) {
      await prisma.participation.create({
        data: {
          talentId: p.talentId,
          eventId: newEvent.id,
          campusId,
          bringPc: p.bringPc,
          isPresent: false,
        },
      });
    }

    return newEvent.id;
  },

  // TODO: activity recommender for parallel tracks in coding clubs

  /**
   * Updates an event.
   */
  async updateEvent(
    eventId: string,
    campusId: string,
    data: {
      titre: string;
      date: string;
      endDate?: string;
      theme?: string;
      notes?: string;
      mantas?: string[];
    },
  ) {
    const currentEvent = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
    });
    if (currentEvent.campusId !== campusId) {
      throw error(
        403,
        'Accès refusé : cet événement appartient à un autre campus.',
      );
    }
    const oldThemeId = currentEvent.themeId;

    let newThemeId: string | null = null;
    if (data.theme && data.theme.trim() !== '') {
      const existing = await prisma.theme.findFirst({
        where: { nom: data.theme },
      });

      if (existing) {
        newThemeId = existing.id;
      } else {
        const created = await prisma.theme.create({
          data: { nom: data.theme, campusId },
        });
        newThemeId = created.id;
      }
    }

    // Update mantas and event atomically
    await prisma.$transaction(async (tx) => {
      if (data.mantas) {
        await tx.eventManta.deleteMany({ where: { eventId } });
        if (data.mantas.length > 0) {
          await tx.eventManta.createMany({
            data: data.mantas.map((staffProfileId) => ({
              eventId,
              staffProfileId,
            })),
          });
        }
      }

      await tx.event.update({
        where: { id: eventId },
        data: {
          titre: data.titre,
          date: new Date(data.date),
          endDate: data.endDate ? new Date(data.endDate) : null,
          themeId: newThemeId ?? undefined,
          notes: data.notes,
        },
      });
    });

    return oldThemeId !== newThemeId;
  },
};
