import { error } from '@sveltejs/kit';
import { generatePin } from '$lib/utils';
import { prisma } from '$lib/server/db';
import { eventTypeHasTheme, hhmmToMinutes } from '$lib/domain/event';

async function validateMantaIds(campusId: string, mantaIds: string[]) {
  if (mantaIds.length === 0) return;
  const uniqueIds = [...new Set(mantaIds)];
  const validCount = await prisma.staffProfile.count({
    where: {
      id: { in: uniqueIds },
      campusId,
      staffRole: { in: ['manta', 'peda'] },
    },
  });
  if (validCount !== uniqueIds.length) {
    throw error(
      400,
      'Rôle ou campus invalide : tous les mantas doivent appartenir à ce campus et avoir le rôle manta ou peda.',
    );
  }
}

export const EventService = {
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
        startMinutes: original.startMinutes,
        themeId: original.themeId,
        campusId,
        pin,
        mantas: {
          create: original.mantas.map((m) => ({
            staffProfileId: m.staffProfileId,
          })),
        },
        planning: { create: {} },
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
   * Sets (or clears) the Jump-owned start time-of-day. SF never provides it,
   * and the sync never writes `startMinutes` back, so this is the single
   * writer. `startTime` is "HH:MM"; empty clears it back to the type default
   * (`startMinutes = null` = unconfirmed). A non-null value means a human
   * confirmed the time.
   */
  async setStartTime(eventId: string, campusId: string, startTime: string) {
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
    await prisma.event.update({
      where: { id: eventId },
      data: { startMinutes: hhmmToMinutes(startTime) },
    });
  },

  /**
   * Updates Jump-side metadata on an event. Identity fields (titre, date,
   * endDate, mantas) are owned by Salesforce — the SF worker would overwrite
   * anything we write locally, so they're not editable here. The start time
   * has its own writer (`setStartTime`), kept apart so editing notes can't
   * touch it.
   */
  async updateEvent(
    eventId: string,
    campusId: string,
    data: {
      theme?: string;
      notes?: string;
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
    const themeApplies = eventTypeHasTheme(currentEvent.eventType);

    let newThemeId: string | null = null;
    if (themeApplies && data.theme && data.theme.trim() !== '') {
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

    await prisma.event.update({
      where: { id: eventId },
      data: {
        themeId: themeApplies ? (newThemeId ?? undefined) : undefined,
        notes: data.notes,
      },
    });

    return themeApplies && oldThemeId !== newThemeId;
  },

  /**
   * Replaces an event's assigned mantas.
   */
  async assignMantas(eventId: string, campusId: string, mantaIds: string[]) {
    const currentEvent = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { campusId: true },
    });
    if (currentEvent.campusId !== campusId) {
      throw error(
        403,
        'Accès refusé : cet événement appartient à un autre campus.',
      );
    }

    await validateMantaIds(campusId, mantaIds);

    await prisma.$transaction(async (tx) => {
      await tx.eventManta.deleteMany({ where: { eventId } });
      if (mantaIds.length > 0) {
        await tx.eventManta.createMany({
          data: mantaIds.map((staffProfileId) => ({
            eventId,
            staffProfileId,
          })),
        });
      }
    });
  },

  async addEventStaff(
    eventId: string,
    campusId: string,
    staffProfileId: string,
  ) {
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
    await validateMantaIds(campusId, [staffProfileId]);
    await prisma.eventManta.upsert({
      where: { eventId_staffProfileId: { eventId, staffProfileId } },
      create: { eventId, staffProfileId },
      update: {},
    });
  },

  async removeEventStaff(
    eventId: string,
    campusId: string,
    staffProfileId: string,
  ) {
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
    await prisma.eventManta.deleteMany({
      where: { eventId, staffProfileId },
    });
  },
};
