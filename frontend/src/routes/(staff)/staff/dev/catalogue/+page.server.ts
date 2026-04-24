import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { requireFlag } from '$lib/server/auth/guards';

export const load: PageServerLoad = async ({ locals }) => {
  requireFlag(locals, 'coding_club');
  // Fetch templates, excluding "orga" type (like break times or generic calls)
  // We want to show real pedagogical content to the admissions team.
  const templates = await prisma.activityTemplate.findMany({
    where: {
      activityType: { not: 'orga' },
      campusId: null, // We mostly want to show official global templates
    },
    orderBy: { nom: 'asc' },
    include: { activityTemplateThemes: { include: { theme: true } } },
  });

  return { templates };
};
