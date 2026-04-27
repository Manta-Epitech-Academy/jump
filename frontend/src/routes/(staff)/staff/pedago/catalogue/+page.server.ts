import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { getCampusId } from '$lib/server/db/scoped';
import { requireFlag } from '$lib/server/auth/guards';

export const load: PageServerLoad = async ({ locals }) => {
  requireFlag(locals, 'coding_club');
  const campusId = getCampusId(locals);
  const templates = await prisma.activityTemplate.findMany({
    where: {
      activityType: { not: 'orga' },
      OR: [{ campusId: null }, { campusId }],
    },
    orderBy: { nom: 'asc' },
    include: { activityTemplateThemes: { include: { theme: true } } },
  });

  return { templates };
};
