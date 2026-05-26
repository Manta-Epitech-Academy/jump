import type { PageServerLoad, Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { renderWelcomeMessage } from '$lib/domain/welcomeMessage';
import { stageWindowEnd } from '$lib/domain/event';

const SLUG = 'welcome';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

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

  const page = await prisma.cmsPage.findUnique({
    where: { slug_eventId: { slug: SLUG, eventId: event.id } },
  });

  if (!page?.content) {
    throw redirect(303, resolve('/'));
  }

  // Shared renderer keeps token substitution identical to the dashboard feed.
  const cmsContent = renderWelcomeMessage(page.content, {
    prenom: locals.talent.prenom,
    nom: locals.talent.nom,
    campusName: event.campus.name,
    campusContactEmail: event.campus.contactEmail,
    stageName: event.titre,
  });

  const alreadySeen = !!locals.talent.welcomeSeenAt;
  return {
    cmsContent,
    alreadySeen,
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
