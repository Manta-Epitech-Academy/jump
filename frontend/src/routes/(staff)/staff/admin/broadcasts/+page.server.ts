import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import {
  getBroadcastProgress,
  getBroadcastStats,
} from '$lib/server/services/communicationStats';

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

  // Per-row recipient progress + the 30-day headline stats share one service.
  const [progress, stats] = await Promise.all([
    getBroadcastProgress(broadcasts.map((b) => b.id)),
    getBroadcastStats(),
  ]);

  return {
    broadcasts: broadcasts.map((b) => ({ ...b, progress: progress[b.id] })),
    stats,
  };
};
