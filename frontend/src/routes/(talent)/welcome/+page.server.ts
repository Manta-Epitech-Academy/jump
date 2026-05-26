import type { PageServerLoad, Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

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

  const alreadySeen = !!locals.talent.welcomeSeenAt;
  return {
    alreadySeen,
    prenom: locals.talent.prenom,
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

    // The message has been read here; welcome runs before onboarding, so hand
    // off to the onboarding flow. The dashboard celebration fires later, once
    // onboarding completes and redirects with `?welcome=1`.
    throw redirect(303, resolve('/onboarding'));
  },
};
