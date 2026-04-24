import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { getCampusId } from '$lib/server/db/scoped';

export const load: LayoutServerLoad = async ({ locals, params }) => {
  const campusId = getCampusId(locals);
  const template = await prisma.activityTemplate.findFirst({
    where: {
      id: params.templateId,
      OR: [{ campusId: null }, { campusId }],
    },
    include: {
      activityTemplateThemes: { include: { theme: true } },
    },
  });

  if (!template) throw error(404, 'Sujet introuvable');

  return { template };
};
