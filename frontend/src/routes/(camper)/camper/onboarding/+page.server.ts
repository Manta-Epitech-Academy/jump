import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

export type OnboardingStep = 'charter' | 'rules' | 'image-rights';

function getCurrentStep(profile: {
  charterAcceptedAt: Date | null;
  rulesSignedAt: Date | null;
  imageRightsSignedAt: Date | null;
}): OnboardingStep | null {
  if (!profile.charterAcceptedAt) return 'charter';
  if (!profile.rulesSignedAt) return 'rules';
  if (!profile.imageRightsSignedAt) return 'image-rights';
  return null;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.studentProfile) {
    throw error(401, 'Non autorisé');
  }

  const step = getCurrentStep(locals.studentProfile);

  if (!step) {
    throw redirect(303, resolve('/camper'));
  }

  return { step };
};

export const actions: Actions = {
  signCharter: async ({ locals }) => {
    if (!locals.studentProfile) {
      throw error(401, 'Non autorisé');
    }

    await prisma.studentProfile.update({
      where: { id: locals.studentProfile.id },
      data: { charterAcceptedAt: new Date() },
    });

    throw redirect(303, resolve('/camper/onboarding'));
  },

  signRules: async ({ locals }) => {
    if (!locals.studentProfile) {
      throw error(401, 'Non autorisé');
    }

    await prisma.studentProfile.update({
      where: { id: locals.studentProfile.id },
      data: { rulesSignedAt: new Date() },
    });

    throw redirect(303, resolve('/camper/onboarding'));
  },

  signImageRights: async ({ request, locals }) => {
    if (!locals.studentProfile) {
      throw error(401, 'Non autorisé');
    }

    const formData = await request.formData();
    const signerName = (formData.get('signerName') as string)?.trim();

    if (!signerName || signerName.length < 2) {
      return { error: 'Veuillez entrer le nom complet du représentant légal.' };
    }

    await prisma.studentProfile.update({
      where: { id: locals.studentProfile.id },
      data: {
        imageRightsSignedAt: new Date(),
        imageRightsSignerName: signerName,
      },
    });

    throw redirect(303, resolve('/camper/onboarding'));
  },
};
