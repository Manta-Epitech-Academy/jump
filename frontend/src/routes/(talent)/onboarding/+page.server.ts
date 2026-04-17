import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { infoValidationSchema } from '$lib/validation/onboarding';
import { generateOnboardingPDF } from '$lib/server/services/onboardingDocumentGenerator';
import { getStorage } from '$lib/server/infra/storage';
import { auth } from '$lib/server/auth';
import { sendParentSignatureEmail } from '$lib/server/services/parentEmail';

export type OnboardingStep = 'info-validation' | 'rules';

function getCurrentStep(profile: {
  infoValidatedAt: Date | null;
  rulesSignedAt: Date | null;
}): OnboardingStep | null {
  if (!profile.infoValidatedAt) return 'info-validation';
  if (!profile.rulesSignedAt) return 'rules';
  return null;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const step = getCurrentStep(locals.talent);

  if (!step) {
    throw redirect(303, resolve('/'));
  }

  if (step === 'info-validation') {
    const user = locals.user!;
    return {
      step,
      profile: {
        nom: locals.talent.nom,
        prenom: locals.talent.prenom,
        email: user.email,
        parentNom: locals.talent.parentNom ?? '',
        parentPrenom: locals.talent.parentPrenom ?? '',
        parentEmail: locals.talent.parentEmail ?? '',
        parentPhone: locals.talent.parentPhone ?? '',
        phone: locals.talent.phone ?? '',
      },
    };
  }

  return { step };
};

export const actions: Actions = {
  validateInfo: async ({ request, locals }) => {
    if (!locals.talent) {
      throw error(401, 'Non autorisé');
    }

    const formData = await request.formData();
    const raw = Object.fromEntries(formData);
    const result = infoValidationSchema.safeParse(raw);

    if (!result.success) {
      return {
        step: 'info-validation' as const,
        errors: result.error.flatten().fieldErrors,
        values: raw,
      };
    }

    await prisma.talent.update({
      where: { id: locals.talent.id },
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

    if (result.data.parentEmail) {
      const parentEmail = result.data.parentEmail.toLowerCase().trim();
      const studentName = `${result.data.prenom} ${result.data.nom}`;
      const talentId = locals.talent.id;

      (async () => {
        // Upsert parent bauth_user
        let parentUser = await prisma.bauth_user.findUnique({
          where: { email: parentEmail },
        });

        if (!parentUser) {
          parentUser = await prisma.bauth_user.create({
            data: {
              email: parentEmail,
              name: `${result.data.parentPrenom} ${result.data.parentNom}`,
              role: 'parent',
              emailVerified: true,
            },
          });
        } else {
          await prisma.bauth_user.update({
            where: { id: parentUser.id },
            data: {
              name: `${result.data.parentPrenom} ${result.data.parentNom}`,
            },
          });
        }

        // Send OTP via BetterAuth
        await auth.api.sendVerificationOTP({
          body: { email: parentEmail, type: 'sign-in' },
        });

        // Send parent email with link
        await sendParentSignatureEmail(parentEmail, talentId, studentName);
      })().catch((err) => console.error('Failed to send parent email:', err));
    }

    throw redirect(303, resolve('/onboarding'));
  },

  signRules: async ({ request, locals }) => {
    if (!locals.talent) {
      throw error(401, 'Non autorisé');
    }

    const formData = await request.formData();
    const city = (formData.get('city') as string)?.trim();
    const accepted = formData.get('accepted');

    if (!accepted) {
      return {
        step: 'rules' as const,
        error: 'Vous devez accepter le règlement pour continuer.',
      };
    }
    if (!city) {
      return { step: 'rules' as const, error: 'Veuillez indiquer la ville.' };
    }

    const now = new Date();
    const storage = getStorage();
    const pdf = await generateOnboardingPDF({
      type: 'rules',
      studentName: `${locals.talent.prenom} ${locals.talent.nom}`,
      signedAt: now,
      city,
    });

    const key = `documents/${locals.talent.id}/rules-${now.getTime()}.pdf`;
    await storage.save(key, pdf);

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: { rulesSignedAt: now, rulesFilePath: key, charterAcceptedAt: now },
    });

    throw redirect(303, resolve('/onboarding'));
  },
};
