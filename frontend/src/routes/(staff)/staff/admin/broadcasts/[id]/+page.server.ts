import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { processBroadcast } from '$lib/server/services/broadcast/orchestrator';

const RECIPIENTS_PAGE_SIZE = 100;

// Reset a `failed` recipient so the orchestrator picks it up again: back to
// `pending`, attempt counter cleared (a manual retry grants fresh attempts) and
// `lastTriedAt` nulled so the per-row cooldown gate doesn't hold it back.
const RETRY_RESET = {
  status: 'pending',
  errorMessage: null,
  retryCount: 0,
  lastTriedAt: null,
} as const;

// Requeue the broadcast (the orchestrator's claim only matches `queued` /
// stuck-`sending`) and re-run it fire-and-forget, mirroring the onboarding-pdf
// retry. The atomic claim in `processBroadcast` makes a concurrent cron tick a
// no-op, so this can't double-send.
async function requeueAndRun(broadcastId: string): Promise<void> {
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: 'queued' },
  });
  void processBroadcast(broadcastId);
}

function parsePage(raw: string | null): number {
  const n = parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export const load: PageServerLoad = async ({ params, url }) => {
  const recipientsPage = parsePage(url.searchParams.get('page'));
  const where = { broadcastId: params.id };

  // Stats are computed via aggregate so they reflect the whole broadcast
  // even when only one page of recipients is hydrated. Cheaper than
  // pulling all rows just to count them.
  const [broadcast, recipients, recipientsTotal, stats, opened] =
    await Promise.all([
      prisma.broadcast.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          name: true,
          channel: true,
          audience: true,
          status: true,
          createdAt: true,
          subjectSnapshot: true,
          bodySnapshot: true,
          campus: { select: { name: true } },
          event: { select: { titre: true } },
          template: { select: { id: true, name: true } },
          createdBy: { select: { name: true, email: true } },
          _count: { select: { recipients: true } },
        },
      }),
      prisma.broadcastRecipient.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: RECIPIENTS_PAGE_SIZE,
        skip: (recipientsPage - 1) * RECIPIENTS_PAGE_SIZE,
        select: {
          id: true,
          recipientEmail: true,
          recipientPhone: true,
          status: true,
          sentAt: true,
          openedAt: true,
          errorMessage: true,
          talent: { select: { prenom: true, nom: true } },
          parentOf: {
            select: {
              parentPrenom: true,
              parentNom: true,
              prenom: true,
              nom: true,
            },
          },
          staffUser: { select: { name: true } },
        },
      }),
      prisma.broadcastRecipient.count({ where }),
      prisma.broadcastRecipient
        .groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        })
        .then((rows) => {
          const out = { sent: 0, failed: 0, pending: 0 };
          for (const r of rows) {
            if (r.status === 'sent') out.sent = r._count._all;
            else if (r.status === 'failed') out.failed = r._count._all;
            else if (r.status === 'pending') out.pending = r._count._all;
          }
          return out;
        }),
      // Opened count reuses the same `where`, independent of the status groupBy,
      // so it joins the batch instead of trailing it with an extra round-trip.
      prisma.broadcastRecipient.count({
        where: { ...where, openedAt: { not: null } },
      }),
    ]);
  if (!broadcast) error(404, 'Envoi introuvable');

  return {
    broadcast,
    recipients,
    recipientsTotal,
    recipientsPage,
    recipientsPageSize: RECIPIENTS_PAGE_SIZE,
    stats: { ...stats, opened },
  };
};

export const actions: Actions = {
  // Retry a single failed recipient.
  retry: async ({ params, request }) => {
    const formData = await request.formData();
    const recipientId = formData.get('recipientId');
    if (typeof recipientId !== 'string' || !recipientId) return fail(400);

    const reset = await prisma.broadcastRecipient.updateMany({
      where: { id: recipientId, broadcastId: params.id, status: 'failed' },
      data: RETRY_RESET,
    });
    if (reset.count === 0) {
      return fail(404, {
        message: 'Aucun échec à réessayer pour ce destinataire.',
      });
    }

    await requeueAndRun(params.id);
    return { success: true, retried: 1 };
  },

  // Retry every failed recipient of this broadcast.
  retryAll: async ({ params }) => {
    const reset = await prisma.broadcastRecipient.updateMany({
      where: { broadcastId: params.id, status: 'failed' },
      data: RETRY_RESET,
    });
    if (reset.count === 0) {
      return fail(400, { message: 'Aucun échec à réessayer.' });
    }

    await requeueAndRun(params.id);
    return { success: true, retried: reset.count };
  },
};
