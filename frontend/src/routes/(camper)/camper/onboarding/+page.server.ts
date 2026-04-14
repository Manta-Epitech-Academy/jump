import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { infoValidationSchema } from '$lib/validation/onboarding';
import { generateOnboardingPDF } from '$lib/server/services/onboardingDocumentGenerator';
import { getStorage } from '$lib/server/infra/storage';

export type OnboardingStep =
  | 'info-validation'
  | 'charter'
  | 'rules'
  | 'image-rights';

function getCurrentStep(profile: {
  infoValidatedAt: Date | null;
  charterAcceptedAt: Date | null;
  rulesSignedAt: Date | null;
  imageRightsSignedAt: Date | null;
}): OnboardingStep | null {
  if (!profile.infoValidatedAt) return 'info-validation';
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

  if (step === 'info-validation') {
    const user = locals.user!;
    return {
      step,
      profile: {
        nom: locals.studentProfile.nom,
        prenom: locals.studentProfile.prenom,
        email: user.email,
        parentNom: locals.studentProfile.parentNom ?? '',
        parentPrenom: locals.studentProfile.parentPrenom ?? '',
        parentEmail: locals.studentProfile.parentEmail ?? '',
        parentPhone: locals.studentProfile.parentPhone ?? '',
        phone: locals.studentProfile.phone ?? '',
      },
    };
  }

  return { step };
};

export const actions: Actions = {
  validateInfo: async ({ request, locals }) => {
    if (!locals.studentProfile) {
      throw error(401, 'Non autorisé');
    }

    const formData = await request.formData();
    const raw = Object.fromEntries(formData);
    const result = infoValidationSchema.safeParse(raw);

    if (!result.success) {
      return { step: 'info-validation' as const, errors: result.error.flatten().fieldErrors, values: raw };
    }

    await prisma.studentProfile.update({
      where: { id: locals.studentProfile.id },
      data: {
        nom: result.data.nom,
        prenom: result.data.prenom,
        parentNom: result.data.parentNom,
        parentPrenom: result.data.parentPrenom,
        parentEmail: result.data.parentEmail,
        parentPhone: result.data.parentPhone || null,
        phone: result.data.phone || null,
        infoValidatedAt: new Date(),
      },
    });

    throw redirect(303, resolve('/camper/onboarding'));
  },

  signCharter: async ({ locals }) => {
    if (!locals.studentProfile) {
      throw error(401, 'Non autorisé');
    }

    const now = new Date();
    const storage = getStorage();
    const pdf = await generateOnboardingPDF({
      type: 'charter',
      studentName: `${locals.studentProfile.prenom} ${locals.studentProfile.nom}`,
      signedAt: now,
    });

    const key = `documents/${locals.studentProfile.id}/charter-${now.getTime()}.pdf`;
    await storage.save(key, pdf);

    await prisma.studentProfile.update({
      where: { id: locals.studentProfile.id },
      data: { charterAcceptedAt: now, charterFilePath: key },
    });

    throw redirect(303, resolve('/camper/onboarding'));
  },

  signRules: async ({ locals }) => {
    if (!locals.studentProfile) {
      throw error(401, 'Non autorisé');
    }

    const now = new Date();
    const storage = getStorage();
    const pdf = await generateOnboardingPDF({
      type: 'rules',
      studentName: `${locals.studentProfile.prenom} ${locals.studentProfile.nom}`,
      signedAt: now,
    });

    const key = `documents/${locals.studentProfile.id}/rules-${now.getTime()}.pdf`;
    await storage.save(key, pdf);

    await prisma.studentProfile.update({
      where: { id: locals.studentProfile.id },
      data: { rulesSignedAt: now, rulesFilePath: key },
    });

    throw redirect(303, resolve('/camper/onboarding'));
  },
};
