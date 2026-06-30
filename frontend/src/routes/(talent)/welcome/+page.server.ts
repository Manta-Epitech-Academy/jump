import type { PageServerLoad, Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { stageWindowEnd, STAGE_DEFAULT_DURATION_DAYS } from '$lib/domain/event';
import { captureOnboardingReturn } from '$lib/server/auth/loginRedirect';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  // /welcome is a one-shot gate before onboarding, not a destination. Once
  // seen, the route guard stops redirecting here, so the only way back is a
  // bookmark/refresh/back-button — send those home rather than re-showing the
  // splash. Cheaper than the stage query below, so check it first.
  if (locals.talent.welcomeSeenAt) {
    throw redirect(303, resolve('/'));
  }

  // Prefer the ongoing stage among several: filter to still-open windows, then
  // take the earliest-starting (mirrors the dashboard welcome card).
  const now = new Date();
  const windowLookback = new Date(
    now.getTime() - STAGE_DEFAULT_DURATION_DAYS * 86_400_000,
  );
  const stageParticipation = await prisma.participation.findFirst({
    where: {
      talentId: locals.talent.id,
      event: {
        eventType: 'stage_seconde',
        OR: [
          { endDate: { gte: now } },
          { endDate: null, date: { gte: windowLookback } },
        ],
      },
    },
    orderBy: { event: { date: 'asc' } },
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

  // The splash is showing, so the talent is entering the funnel: stash the page
  // they were originally heading for (e.g. an émargement QR) to resume after
  // onboarding. Survives the markSeen → onboarding handoff via the cookie.
  captureOnboardingReturn(url, cookies);

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
    // onboarding completes and arms the one-shot arrival-celebration cookie.
    throw redirect(303, resolve('/onboarding'));
  },
};
