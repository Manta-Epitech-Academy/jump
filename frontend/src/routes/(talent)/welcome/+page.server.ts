import type { PageServerLoad, Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

const SLUG = 'welcome';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  const stageParticipation = await prisma.participation.findFirst({
    where: {
      talentId: locals.talent.id,
      event: { eventType: 'stage_seconde' },
    },
    orderBy: { event: { date: 'desc' } },
    select: { event: { select: { id: true, endDate: true, date: true } } },
  });

  if (!stageParticipation) {
    throw redirect(303, resolve('/'));
  }

  const stageEnd =
    stageParticipation.event.endDate ?? stageParticipation.event.date;
  if (stageEnd < new Date()) {
    throw redirect(303, resolve('/'));
  }

  const page = await prisma.cmsPage.findUnique({
    where: {
      slug_eventId: {
        slug: SLUG,
        eventId: stageParticipation.event.id,
      },
    },
  });

  if (!page?.content) {
    throw redirect(303, resolve('/'));
  }

  // Replace CMS variables
  const cmsContent = page.content
    .replace(/\{\{PRENOM\}\}/gi, locals.talent.prenom)
    .replace(/\{\{NOM\}\}/gi, locals.talent.nom);

  const alreadySeen = !!locals.talent.welcomeSeenAt;
  return { cmsContent, alreadySeen, prenom: locals.talent.prenom };
};

export const actions: Actions = {
  markSeen: async ({ locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: { welcomeSeenAt: new Date() },
    });

    // Redirect to onboarding instead of home
    throw redirect(303, resolve('/onboarding'));
  },
};
