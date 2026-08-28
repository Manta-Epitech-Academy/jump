import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  resolveSyncError,
  resolveAllSyncErrors,
  resolveSyncErrors,
  rebindTalentExtId,
} from '$lib/server/services/syncErrorService';

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

  const campusNames = [
    ...new Set(
      events.map((ev) => ev.campus?.name).filter((n): n is string => !!n),
    ),
  ].sort();

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
    campusNames,
  };
};

export const actions: Actions = {
  resolve: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_SYNC_ERROR_RESOLVE, { locals });
    const formData = await request.formData();
    const id = formData.get('id') as string;
    if (!id) return fail(400);

    await resolveSyncError(id);
    return { success: true };
  },

  resolveAll: async ({ locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_SYNC_ERROR_RESOLVE, { locals });
    await resolveAllSyncErrors();
    return { success: true };
  },

  resolveSelected: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_SYNC_ERROR_RESOLVE, { locals });
    const formData = await request.formData();
    const ids = formData
      .getAll('ids')
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (ids.length === 0) return fail(400);

    const { count } = await resolveSyncErrors(ids);
    return { success: true, count };
  },

  rebind: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_SYNC_ERROR_REBIND, { locals });
    const formData = await request.formData();
    const id = formData.get('id');
    if (typeof id !== 'string' || !id) return fail(400);

    const result = await rebindTalentExtId(id);
    if (result.ok) return { success: true };

    switch (result.reason) {
      case 'not_found':
        return fail(404, { rebindError: 'Erreur introuvable.' });
      case 'no_existing_ext_id':
        return fail(400, {
          rebindError: 'Aucun extId existant à migrer pour cette erreur.',
        });
      case 'ext_id_taken':
        return fail(409, {
          rebindError:
            'Le nouvel extId est déjà utilisé par un autre talent : résolution manuelle requise.',
        });
    }
  },
};
