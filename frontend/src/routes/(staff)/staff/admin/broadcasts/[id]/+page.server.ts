import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

const RECIPIENTS_PAGE_SIZE = 100;

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
  const [broadcast, recipients, recipientsTotal, stats] = await Promise.all([
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
  ]);
  if (!broadcast) error(404, 'Envoi introuvable');

  const opened = await prisma.broadcastRecipient.count({
    where: { ...where, openedAt: { not: null } },
  });

  return {
    broadcast,
    recipients,
    recipientsTotal,
    recipientsPage,
    recipientsPageSize: RECIPIENTS_PAGE_SIZE,
    stats: { ...stats, opened },
  };
};
