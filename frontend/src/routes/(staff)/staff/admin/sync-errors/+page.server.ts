import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async () => {
  const [errors, unresolvedCount] = await Promise.all([
    prisma.syncError.findMany({
      orderBy: { lastOccurredAt: 'desc' },
      take: 100,
    }),
    prisma.syncError.count({ where: { resolved: false } }),
  ]);

  // Resolve event names + campus from eventExtId
  const eventExtIds = [
    ...new Set(errors.map((e) => e.eventExtId).filter(Boolean)),
  ] as string[];
  const events = eventExtIds.length
    ? await prisma.event.findMany({
        where: { externalId: { in: eventExtIds } },
        select: {
          externalId: true,
          titre: true,
          campus: { select: { name: true } },
        },
      })
    : [];
  const eventMap = new Map(events.map((ev) => [ev.externalId, ev]));

  return {
    errors: errors.map((e: (typeof errors)[number]) => {
      const event = e.eventExtId ? eventMap.get(e.eventExtId) : null;
      return {
        ...e,
        eventName: event?.titre ?? null,
        campusName: event?.campus?.name ?? null,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
        lastOccurredAt: e.lastOccurredAt.toISOString(),
        resolvedAt: e.resolvedAt?.toISOString() ?? null,
      };
    }),
    unresolvedCount,
  };
};

export const actions: Actions = {
  resolve: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;
    if (!id) return fail(400);

    await prisma.syncError.update({
      where: { id },
      data: { resolved: true, resolvedAt: new Date() },
    });

    return { success: true };
  },

  resolveAll: async () => {
    await prisma.syncError.updateMany({
      where: { resolved: false },
      data: { resolved: true, resolvedAt: new Date() },
    });

    return { success: true };
  },

  /**
   * Rebind a talent's externalId from the dead one (`existingExtId`) to the
   * one Salesforce is now sending (`attemptedExtId`), then mark the row
   * resolved. Used for the "Salesforce regenerated the extId" case — the
   * same human, new identifier, our DB needs to catch up.
   *
   * Safety:
   *   - Row must carry an `existingExtId` (the lookup that surfaced the
   *     conflict must have found the prior talent). Otherwise we have
   *     nothing to migrate.
   *   - If the prior talent no longer exists (someone already rebound it),
   *     just resolve the row idempotently.
   *   - If the target `attemptedExtId` is already taken by *another*
   *     talent in our DB, refuse — that's a different conflict the admin
   *     needs to inspect manually.
   */
  rebind: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id');
    if (typeof id !== 'string' || !id) return fail(400);

    const row = await prisma.syncError.findUnique({ where: { id } });
    if (!row) return fail(404, { rebindError: 'Erreur introuvable.' });
    if (!row.existingExtId) {
      return fail(400, {
        rebindError: 'Aucun extId existant à migrer pour cette erreur.',
      });
    }

    const existing = await prisma.talent.findUnique({
      where: { externalId: row.existingExtId },
      select: { id: true },
    });
    if (!existing) {
      // Prior talent gone (manual delete or already rebound) — clean up
      // the row instead of failing.
      await prisma.syncError.update({
        where: { id },
        data: { resolved: true, resolvedAt: new Date() },
      });
      return { success: true };
    }

    const clash = await prisma.talent.findUnique({
      where: { externalId: row.attemptedExtId },
      select: { id: true },
    });
    if (clash && clash.id !== existing.id) {
      return fail(409, {
        rebindError:
          'Le nouvel extId est déjà utilisé par un autre talent — résolution manuelle requise.',
      });
    }

    await prisma.$transaction([
      prisma.talent.update({
        where: { id: existing.id },
        data: { externalId: row.attemptedExtId },
      }),
      prisma.syncError.update({
        where: { id },
        data: { resolved: true, resolvedAt: new Date() },
      }),
    ]);

    return { success: true };
  },
};
