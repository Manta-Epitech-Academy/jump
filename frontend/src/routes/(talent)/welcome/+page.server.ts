import type { PageServerLoad, Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { stageWindowEnd } from '$lib/domain/event';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  // /welcome is a one-shot gate before onboarding, not a destination. Once
  // seen, the route guard stops redirecting here, so the only way back is a
  // bookmark/refresh/back-button — send those home rather than re-showing the
  // splash. Cheaper than the stage query below, so check it first.
  if (locals.talent.welcomeSeenAt) {
    throw redirect(303, resolve('/'));
  }

  const stageParticipation = await prisma.participation.findFirst({
    where: {
      talentId: locals.talent.id,
      event: { eventType: 'stage_seconde' },
    },
    orderBy: { event: { date: 'desc' } },
    select: {
      event: {
        select: {
          id: true,
          titre: true,
          endDate: true,
          date: true,
          campus: { select: { name: true, contactEmail: true } },
        },
      },
    },
  });

  if (!stageParticipation) {
    throw redirect(303, resolve('/'));
  }

  const { event } = stageParticipation;
  const stageEnd = stageWindowEnd(event.date, event.endDate);
  if (stageEnd < new Date()) {
    throw redirect(303, resolve('/'));
  }

  return {
    prenom: locals.talent.prenom,
    eventId: event.id,
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
