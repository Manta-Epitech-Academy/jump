import type { PageServerLoad, Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { getOnboardingStep } from '$lib/domain/talentOnboarding';
import { captureOnboardingReturn } from '$lib/server/auth/loginRedirect';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  // /welcome is a one-shot gate before onboarding, not a destination. It shows
  // to a fresh talent who hasn't seen it AND still has onboarding to do (the
  // same talent-state gate the route guard applies). Anyone else — already
  // welcomed, or already fully onboarded — is sent home. Not event-gated: the
  // splash copy is generic (no per-event content).
  if (
    locals.talent.welcomeSeenAt ||
    getOnboardingStep(locals.talent) === null
  ) {
    throw redirect(303, resolve('/'));
  }

  // The splash is showing, so the talent is entering the funnel: stash the page
  // they were originally heading for (e.g. an émargement QR) to resume after
  // onboarding. Survives the markSeen → onboarding handoff via the cookie.
  captureOnboardingReturn(url, cookies);

  return {
    prenom: locals.talent.prenom,
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
