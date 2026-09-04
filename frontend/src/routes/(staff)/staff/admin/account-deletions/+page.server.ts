import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  fulfillTalentDeletion,
  isDeletionRequestOverdue,
  rejectTalentDeletion,
} from '$lib/server/services/talentDeletionService';

const talentSelect = {
  id: true,
  nom: true,
  prenom: true,
  user: { select: { email: true } },
  xp: true,
  eventsCount: true,
  // Effective campus = most-recent participation's campus, matching the
  // resolution used elsewhere in the admin talent views.
  participations: {
    take: 1,
    orderBy: { event: { date: 'desc' } },
    select: { campus: { select: { name: true } } },
  },
} as const;

export const load: PageServerLoad = async () => {
  const [pending, resolved] = await Promise.all([
    // Oldest first: the closest to breaching the GDPR fulfilment window sits on
    // top, where it's most likely to be acted on.
    prisma.talentDeletionRequest.findMany({
      where: { status: 'pending' },
      orderBy: { requestedAt: 'asc' },
      include: { talent: { select: talentSelect } },
    }),
    prisma.talentDeletionRequest.findMany({
      where: { status: { not: 'pending' } },
      orderBy: { resolvedAt: 'desc' },
      take: 50,
      include: { talent: { select: talentSelect } },
    }),
  ]);

  const shape = (r: (typeof pending)[number]) => ({
    id: r.id,
    status: r.status,
    reason: r.reason,
    requestedAt: r.requestedAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    resolutionNote: r.resolutionNote,
    overdue: r.status === 'pending' && isDeletionRequestOverdue(r.requestedAt),
    talent: {
      id: r.talent.id,
      // Keep nom/prenom split so the client renders them through the shared
      // <TalentName> (NOM uppercased + Prénom), same format as /admin/talents.
      nom: r.talent.nom,
      prenom: r.talent.prenom,
      email: r.talent.user?.email ?? null,
      xp: r.talent.xp,
      eventsCount: r.talent.eventsCount,
      campus: r.talent.participations[0]?.campus?.name ?? null,
    },
  });

  return {
    pending: pending.map(shape),
    resolved: resolved.map(shape),
    overdueCount: pending.filter((r) => isDeletionRequestOverdue(r.requestedAt))
      .length,
  };
};

export const actions: Actions = {
  // Fulfil = erase. Belt-and-braces admin assert on top of the /staff/admin/*
  // route guard, since this destroys a talent's PII.
  fulfill: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_ACCOUNT_DELETION_FULFIL, { locals });
    if (locals.staffProfile?.staffRole !== 'admin' || !locals.user) {
      return fail(403);
    }

    const data = await request.formData();
    const id = data.get('id');
    if (typeof id !== 'string' || !id) return fail(400);

    try {
      const done = await fulfillTalentDeletion(id, locals.user.id);
      if (!done) {
        return fail(409, { message: 'Demande déjà traitée.' });
      }
    } catch (err) {
      console.error('[account-deletions] fulfill failed', err);
      return fail(500, { message: 'Échec de la suppression.' });
    }
    return { success: true };
  },

  reject: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_ACCOUNT_DELETION_REJECT, { locals });
    if (locals.staffProfile?.staffRole !== 'admin' || !locals.user) {
      return fail(403);
    }

    const data = await request.formData();
    const id = data.get('id');
    const note = data.get('note');
    if (typeof id !== 'string' || !id) return fail(400);

    try {
      const done = await rejectTalentDeletion(
        id,
        locals.user.id,
        typeof note === 'string' ? note : null,
      );
      if (!done) {
        return fail(409, { message: 'Demande déjà traitée.' });
      }
    } catch (err) {
      console.error('[account-deletions] reject failed', err);
      return fail(500, { message: 'Échec du refus.' });
    }
    return { success: true };
  },
};
