import type { PageServerLoad, Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

const SLUG = 'welcome';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  // Resolve the talent's most recent stage_seconde participation
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

  // Stage is over — no longer accessible
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

  const alreadySeen = !!locals.talent.welcomeSeenAt;
  return {
    cmsContent: page.content,
    alreadySeen,
    eventId: stageParticipation.event.id,
    talentCreatedAt: locals.talent.createdAt.toISOString(),
  };
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
