import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { eventTypeHasTheme, hhmmToMinutes } from '$lib/domain/event';
import { isEventModuleKey } from '$lib/domain/eventModules';

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
   * Sets the dev-workspace surfaces an event exposes (its `EventConfig_Module`
   * rows). Jump-owned: seeded from the type preset at creation, then edited
   * here per event; the SF sync never touches these rows. Diffs against the
   * current set so unchanged modules keep their `createdAt`, and only writes
   * when something actually changed.
   */
  async setEventModules(
    eventId: string,
    campusId: string,
    moduleKeys: string[],
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

    const desired = new Set<string>(moduleKeys.filter(isEventModuleKey));
    const current = await prisma.eventConfig_Module.findMany({
      where: { eventId },
      select: { moduleKey: true },
    });
    const currentKeys = new Set(current.map((m) => m.moduleKey));

    const toAdd = [...desired].filter((k) => !currentKeys.has(k));
    const toRemove = [...currentKeys].filter((k) => !desired.has(k));
    if (toAdd.length === 0 && toRemove.length === 0) return;

    await prisma.$transaction(async (tx) => {
      if (toRemove.length > 0) {
        await tx.eventConfig_Module.deleteMany({
          where: { eventId, moduleKey: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        // `skipDuplicates` keeps the diff idempotent: two leads saving the same
        // event concurrently both diff against the pre-write snapshot, so the
        // loser would otherwise hit the composite PK (P2002) and roll back its
        // whole save. Skipping the already-present row lets both settle.
        await tx.eventConfig_Module.createMany({
          data: toAdd.map((moduleKey) => ({ eventId, moduleKey })),
          skipDuplicates: true,
        });
      }
    });
  },

  /**
   * Sets (or clears) the feedback form this event uses. Empty `formId` clears
   * the override so the event falls back to the form marked default for its
   * type. A non-empty id is validated to point at an existing form (publication
   * is enforced later, at resolve time). Jump-owned and campus-guarded; the SF
   * sync never touches `feedbackFormId`.
   */
  async setEventFeedbackForm(
    eventId: string,
    campusId: string,
    formId: string,
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

    const next = formId.trim() || null;
    if (next) {
      const form = await prisma.feedback_Form.findUnique({
        where: { id: next },
        select: { id: true },
      });
      if (!form) throw error(400, 'Formulaire introuvable.');
    }

    await prisma.event.update({
      where: { id: eventId },
      data: { feedbackFormId: next },
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
