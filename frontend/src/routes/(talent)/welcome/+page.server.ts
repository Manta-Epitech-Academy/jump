import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

const SLUG = 'welcome';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  // Resolve campus from the talent's most recent participation
  const participation = await prisma.participation.findFirst({
    where: { talentId: locals.talent.id },
    orderBy: { event: { date: 'desc' } },
    select: { campusId: true },
  });

  if (!participation) {
    return { cmsContent: null };
  }

  const page = await prisma.cmsPage.findUnique({
    where: { slug_campusId: { slug: SLUG, campusId: participation.campusId } },
  });

  return { cmsContent: page?.content ?? null };
};
