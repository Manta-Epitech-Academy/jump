import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async () => {
  const broadcasts = await prisma.broadcast.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      channel: true,
      status: true,
      createdAt: true,
      campus: { select: { name: true } },
      event: { select: { titre: true } },
      template: { select: { name: true } },
      _count: { select: { recipients: true } },
    },
  });

  const counts = await prisma.broadcastRecipient.groupBy({
    by: ['broadcastId', 'status'],
    where: { broadcastId: { in: broadcasts.map((b) => b.id) } },
    _count: { _all: true },
  });

  const opened = await prisma.broadcastRecipient.groupBy({
    by: ['broadcastId'],
    where: {
      broadcastId: { in: broadcasts.map((b) => b.id) },
      openedAt: { not: null },
    },
    _count: { _all: true },
  });

  const progress = new Map<
    string,
    { sent: number; failed: number; pending: number; opened: number }
  >();
  for (const b of broadcasts) {
    progress.set(b.id, { sent: 0, failed: 0, pending: 0, opened: 0 });
  }
  for (const c of counts) {
    const p = progress.get(c.broadcastId);
    if (!p) continue;
    p[c.status] = c._count._all;
  }
  for (const o of opened) {
    const p = progress.get(o.broadcastId);
    if (p) p.opened = o._count._all;
  }

  return {
    broadcasts: broadcasts.map((b) => ({
      ...b,
      progress: progress.get(b.id)!,
    })),
  };
};
