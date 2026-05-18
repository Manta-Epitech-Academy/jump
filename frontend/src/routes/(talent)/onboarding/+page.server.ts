import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import {
  infoValidationSchema,
  lyceeSchema,
  techInterestsSchema,
  generalInterestsSchema,
} from '$lib/validation/onboarding';
import { generateOnboardingPDF } from '$lib/server/services/onboardingDocumentGenerator';
import { getStorage } from '$lib/server/infra/storage';
import { sendParentWelcomeEmail } from '$lib/server/otp';

export type OnboardingStep =
  | 'info-validation'
  | 'lycee'
  | 'interests-tech'
  | 'interests-general'
  | 'interests-recap'
  | 'rules';

function getCurrentStep(profile: {
  infoValidatedAt: Date | null;
  highSchoolValidatedAt: Date | null;
  techInterestsValidatedAt: Date | null;
  generalInterestsValidatedAt: Date | null;
  interestsRecapSeenAt: Date | null;
  rulesSignedAt: Date | null;
}): OnboardingStep | null {
  if (!profile.infoValidatedAt) return 'info-validation';
  if (!profile.highSchoolValidatedAt) return 'lycee';
  if (!profile.techInterestsValidatedAt) return 'interests-tech';
  if (!profile.generalInterestsValidatedAt) return 'interests-general';
  if (!profile.interestsRecapSeenAt) return 'interests-recap';
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

  if (step === 'lycee') {
    return {
      step,
      highSchoolName: locals.talent.highSchoolName ?? '',
      highSchoolCity: locals.talent.highSchoolCity ?? '',
    };
  }

  if (step === 'interests-tech') {
    const interests = await prisma.interest.findMany({
      where: { kind: 'tech' },
      orderBy: { order: 'asc' },
    });

    const existing = await prisma.talentInterest.findMany({
      where: { talentId: locals.talent.id, interest: { kind: 'tech' } },
      select: { interestId: true },
    });

    return {
      step,
      interests,
      selectedIds: existing.map((e) => e.interestId),
    };
  }

  if (step === 'interests-general') {
    const interests = await prisma.interest.findMany({
      where: { kind: 'general' },
      orderBy: { order: 'asc' },
    });

    const existing = await prisma.talentInterest.findMany({
      where: { talentId: locals.talent.id, interest: { kind: 'general' } },
      select: { interestId: true },
    });

    // Load tech selections for the recap phrase
    const techSelections = await prisma.talentInterest.findMany({
      where: { talentId: locals.talent.id, interest: { kind: 'tech' } },
      include: { interest: { select: { nom: true, emoji: true } } },
    });

    return {
      step,
      interests,
      selectedIds: existing.map((e) => e.interestId),
      techSelections: techSelections.map((t) => ({
        nom: t.interest.nom,
        emoji: t.interest.emoji,
      })),
    };
  }

  if (step === 'interests-recap') {
    const allSelections = await prisma.talentInterest.findMany({
      where: { talentId: locals.talent.id },
      include: { interest: { select: { nom: true, emoji: true, kind: true } } },
      orderBy: { interest: { order: 'asc' } },
    });

    return {
      step,
      techSelections: allSelections
        .filter((s) => s.interest.kind === 'tech')
        .map((s) => ({ nom: s.interest.nom, emoji: s.interest.emoji })),
      generalSelections: allSelections
        .filter((s) => s.interest.kind === 'general')
        .map((s) => ({ nom: s.interest.nom, emoji: s.interest.emoji })),
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
        parentEmail: result.data.parentEmail.toLowerCase().trim(),
        parentPhone: result.data.parentPhone || null,
        phone: result.data.phone || null,
        infoValidatedAt: new Date(),
      },
    });

    if (result.data.parentEmail) {
      const parentEmail = result.data.parentEmail.toLowerCase().trim();

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

        // Send welcome email (no OTP — parent will request OTP when they log in)
        await sendParentWelcomeEmail(
          parentEmail,
          result.data.parentNom,
          locals.talent!.prenom,
        );
      })().catch((err) =>
        console.error('Failed to send parent welcome email:', err),
      );
    }

    throw redirect(303, resolve('/onboarding'));
  },

  validateLycee: async ({ request, locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const formData = await request.formData();
    const raw = Object.fromEntries(formData);
    const result = lyceeSchema.safeParse(raw);

    if (!result.success) {
      return {
        step: 'lycee' as const,
        error: result.error.issues[0]?.message ?? 'Données invalides.',
      };
    }

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: {
        highSchoolName: result.data.highSchoolName,
        highSchoolCity: result.data.highSchoolCity || null,
        highSchoolValidatedAt: new Date(),
      },
    });

    throw redirect(303, resolve('/onboarding'));
  },

  validateTechInterests: async ({ request, locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const formData = await request.formData();
    const raw = formData.getAll('interestIds');
    const result = techInterestsSchema.safeParse({ interestIds: raw });

    if (!result.success) {
      return {
        step: 'interests-tech' as const,
        error: result.error.issues[0]?.message ?? 'Sélection invalide.',
      };
    }

    const count = await prisma.interest.count({
      where: { id: { in: result.data.interestIds }, kind: 'tech' },
    });
    if (count !== result.data.interestIds.length) {
      return {
        step: 'interests-tech' as const,
        error: "Certains domaines sélectionnés n'existent plus.",
      };
    }

    await prisma.$transaction([
      prisma.talentInterest.deleteMany({
        where: { talentId: locals.talent.id, interest: { kind: 'tech' } },
      }),
      prisma.talentInterest.createMany({
        data: result.data.interestIds.map((interestId) => ({
          talentId: locals.talent!.id,
          interestId,
        })),
      }),
      prisma.talent.update({
        where: { id: locals.talent.id },
        data: { techInterestsValidatedAt: new Date() },
      }),
    ]);

    throw redirect(303, resolve('/onboarding'));
  },

  validateGeneralInterests: async ({ request, locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const formData = await request.formData();
    const raw = formData.getAll('interestIds');
    const result = generalInterestsSchema.safeParse({ interestIds: raw });

    if (!result.success) {
      return {
        step: 'interests-general' as const,
        error: result.error.issues[0]?.message ?? 'Sélection invalide.',
      };
    }

    const count = await prisma.interest.count({
      where: { id: { in: result.data.interestIds }, kind: 'general' },
    });
    if (count !== result.data.interestIds.length) {
      return {
        step: 'interests-general' as const,
        error: "Certains centres d'intérêt sélectionnés n'existent plus.",
      };
    }

    await prisma.$transaction([
      prisma.talentInterest.deleteMany({
        where: { talentId: locals.talent.id, interest: { kind: 'general' } },
      }),
      prisma.talentInterest.createMany({
        data: result.data.interestIds.map((interestId) => ({
          talentId: locals.talent!.id,
          interestId,
        })),
      }),
      prisma.talent.update({
        where: { id: locals.talent.id },
        data: { generalInterestsValidatedAt: new Date() },
      }),
    ]);

    throw redirect(303, resolve('/onboarding'));
  },

  confirmRecap: async ({ locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: { interestsRecapSeenAt: new Date() },
    });

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
      data: {
        rulesSignedAt: now,
        rulesFilePath: key,
        charterAcceptedAt: now,
        xp: { increment: 50 },
      },
    });

    throw redirect(303, resolve('/?welcome=1'));
  },
};
