import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async () => {
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      channel: true,
      subject: true,
      updatedAt: true,
      _count: { select: { broadcasts: true } },
    },
  });
  return { templates };
};
