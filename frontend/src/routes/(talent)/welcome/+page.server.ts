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

  // Resolve campus from the talent's stage_seconde participation
  const stageParticipation = await prisma.participation.findFirst({
    where: {
      talentId: locals.talent.id,
      event: { eventType: 'stage_seconde' },
    },
    orderBy: { event: { date: 'desc' } },
    select: { campusId: true },
  });

  if (!stageParticipation) {
    // No stage_seconde participation — skip welcome, go to dashboard
    throw redirect(303, resolve('/'));
  }

  const page = await prisma.cmsPage.findUnique({
    where: {
      slug_campusId: { slug: SLUG, campusId: stageParticipation.campusId },
    },
  });

  if (!page?.content) {
    // No welcome content for this campus — skip to dashboard
    throw redirect(303, resolve('/'));
  }

  return { cmsContent: page.content };
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
