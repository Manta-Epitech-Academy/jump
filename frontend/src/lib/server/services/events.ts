import { error } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { hhmmToMinutes } from '$lib/domain/event';
import { isEventModuleKey } from '$lib/domain/eventModules';
import { fromWallClock } from '$lib/domain/planningTime';

/**
 * Diffs an event's `EventConfig_Module` rows against the desired set inside an
 * open transaction: deletes removed modules, inserts added ones, leaves
 * unchanged rows (so their `createdAt` is preserved). `skipDuplicates` keeps it
 * idempotent under concurrent saves — two admins saving the same event both
 * diff the pre-write snapshot, so the loser would otherwise hit the composite
 * PK (P2002) and roll back its whole save.
 */
async function applyModuleDiff(
  tx: Prisma.TransactionClient,
  eventId: string,
  moduleKeys: string[],
) {
  const desired = new Set<string>(moduleKeys.filter(isEventModuleKey));
  const current = await tx.eventConfig_Module.findMany({
    where: { eventId },
    select: { moduleKey: true },
  });
  const currentKeys = new Set(current.map((m) => m.moduleKey));

  const toAdd = [...desired].filter((k) => !currentKeys.has(k));
  const toRemove = [...currentKeys].filter((k) => !desired.has(k));

  if (toRemove.length > 0) {
    await tx.eventConfig_Module.deleteMany({
      where: { eventId, moduleKey: { in: toRemove } },
    });
  }
  if (toAdd.length > 0) {
    await tx.eventConfig_Module.createMany({
      data: toAdd.map((moduleKey) => ({ eventId, moduleKey })),
      skipDuplicates: true,
    });
  }
}

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
   * Admin event configuration: the friendly `publicName`, the Jump-owned start
   * time-of-day and end date, free-text notes, and the dev-workspace surfaces
   * the event exposes — all in one transaction. Admin-only (the
   * `/staff/admin/events` page is admin-gated and admins are cross-campus, so
   * there is no campus check here; the event id is the authority). The start
   * `date`, `titre` and `eventType` stay Salesforce-owned. `endDate` is NOT
   * sent by Salesforce, so Jump owns it here (like the start time): a
   * `YYYY-MM-DD` campus-tz day, stored at end-of-day so the last day still
   * reads as "ongoing"; empty clears it back to the type default span. Note an
   * applied planning template also rewrites `endDate` (its last day wins).
   */
  async updateEventConfig(
    eventId: string,
    data: {
      publicName: string;
      startTime: string;
      endDate: string;
      notes: string;
      modules: string[];
      devActivated: boolean;
    },
  ) {
    // Surfaces a clean 404 (rather than a transaction-level throw) if the event
    // vanished between the page load and the save. The campus tz turns the
    // bare end-date day into a correct instant; `devActivatedAt` is read to
    // preserve the original activation instant across edits that keep it on.
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        devActivatedAt: true,
        campus: { select: { timezone: true } },
      },
    });
    // 23:59 campus-local on the chosen day: `getEventStatus` only flips the
    // event to "past" once that whole day has elapsed, and `toDateKey` still
    // resolves it to that day for the émargement créneaux.
    const endDate = data.endDate
      ? fromWallClock(data.endDate, '23:59', event.campus.timezone)
      : null;
    // Keep the existing instant while it stays activated; stamp now on a fresh
    // activation; clear it when deactivated.
    const devActivatedAt = data.devActivated
      ? (event.devActivatedAt ?? new Date())
      : null;

    await prisma.$transaction(async (tx) => {
      await applyModuleDiff(tx, eventId, data.modules);
      await tx.event.update({
        where: { id: eventId },
        data: {
          publicName: data.publicName.trim() || null,
          startMinutes: hhmmToMinutes(data.startTime),
          endDate,
          notes: data.notes,
          devActivatedAt,
        },
      });
    });
  },

  /**
   * Applies one exact module set to many events at once (admin list bulk edit).
   * Overwrite semantics, same per-event diff as a single save, all in one
   * transaction so a partial failure rolls the whole batch back. Admin-only and
   * cross-campus like `updateEventConfig`, so no campus check: the ids are the
   * authority. Only the module rows change; every other event field is left
   * untouched.
   */
  async bulkSetModules(eventIds: string[], modules: string[]) {
    if (eventIds.length === 0) return;
    await prisma.$transaction(async (tx) => {
      for (const eventId of eventIds) {
        await applyModuleDiff(tx, eventId, modules);
      }
    });
  },

  /**
   * Shows or hides many events in the dev workspace at once (the `devActivatedAt`
   * gate). Admin-only, cross-campus: the ids are the authority. On activate only
   * the not-yet-activated rows are stamped, so an already-activated event keeps
   * its original instant; deactivate clears them all.
   */
  async bulkSetActivation(eventIds: string[], activate: boolean) {
    if (eventIds.length === 0) return;
    if (activate) {
      await prisma.event.updateMany({
        where: { id: { in: eventIds }, devActivatedAt: null },
        data: { devActivatedAt: new Date() },
      });
    } else {
      await prisma.event.updateMany({
        where: { id: { in: eventIds } },
        data: { devActivatedAt: null },
      });
    }
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
