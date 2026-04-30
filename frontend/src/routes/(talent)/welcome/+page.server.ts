import type { PageServerLoad, Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

const SLUG = 'welcome';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  // Already seen — redirect to dashboard
  if (locals.talent.welcomeSeenAt) {
    throw redirect(303, resolve('/'));
  }

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

export const actions: Actions = {
  markSeen: async ({ locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: { welcomeSeenAt: new Date() },
    });

    throw redirect(303, resolve('/'));
  },
};
