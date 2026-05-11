import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
  const broadcast = await prisma.broadcast.findUnique({
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
  });
  if (!broadcast) error(404, 'Envoi introuvable');

  const recipients = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: params.id },
    orderBy: { createdAt: 'asc' },
    take: 500,
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
  });

  const stats = recipients.reduce(
    (acc, r) => {
      if (r.status === 'sent') acc.sent++;
      if (r.status === 'failed') acc.failed++;
      if (r.status === 'pending') acc.pending++;
      if (r.openedAt) acc.opened++;
      return acc;
    },
    { sent: 0, failed: 0, pending: 0, opened: 0 },
  );

  return { broadcast, recipients, stats };
};
