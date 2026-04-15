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
  const eventExtIds = [...new Set(errors.map((e) => e.eventExtId).filter(Boolean))] as string[];
  const events = eventExtIds.length
    ? await prisma.event.findMany({
        where: { externalId: { in: eventExtIds } },
        select: { externalId: true, titre: true, campus: { select: { name: true } } },
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
};
