import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import {
  profileSchema,
  interestsSchema,
  equipmentSchema,
} from '$lib/validation/onboarding';
import { generateOnboardingPDF } from '$lib/server/services/onboardingDocumentGenerator';
import { getStorage } from '$lib/server/infra/storage';
import { sendParentWelcomeEmail } from '$lib/server/otp';
import { WELCOME_XP_BONUS } from '$lib/domain/xp';
import { grantXp } from '$lib/server/services/xpService';

export type OnboardingStep = 'profile' | 'interests' | 'equipment' | 'rules';

function getCurrentStep(profile: {
  infoValidatedAt: Date | null;
  highSchoolValidatedAt: Date | null;
  techInterestsValidatedAt: Date | null;
  generalInterestsValidatedAt: Date | null;
  equipmentValidatedAt: Date | null;
  rulesSignedAt: Date | null;
}): OnboardingStep | null {
  if (!profile.infoValidatedAt || !profile.highSchoolValidatedAt)
    return 'profile';
  if (!profile.techInterestsValidatedAt || !profile.generalInterestsValidatedAt)
    return 'interests';
  if (!profile.equipmentValidatedAt) return 'equipment';
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

  if (step === 'profile') {
    const user = locals.user!;
    return {
      step,
      profile: {
        civilite: locals.talent.civilite ?? '',
        nom: locals.talent.nom,
        prenom: locals.talent.prenom,
        email: user.email,
        phone: locals.talent.phone ?? '',
        parentType: locals.talent.parentType ?? '',
        parentCivilite: locals.talent.parentCivilite ?? '',
        parentNom: locals.talent.parentNom ?? '',
        parentPrenom: locals.talent.parentPrenom ?? '',
        parentEmail: locals.talent.parentEmail ?? '',
        parentPhone: locals.talent.parentPhone ?? '',
        parent2Type: locals.talent.parent2Type ?? '',
        parent2Civilite: locals.talent.parent2Civilite ?? '',
        parent2Nom: locals.talent.parent2Nom ?? '',
        parent2Prenom: locals.talent.parent2Prenom ?? '',
        parent2Email: locals.talent.parent2Email ?? '',
        parent2Phone: locals.talent.parent2Phone ?? '',
        highSchoolName: locals.talent.highSchoolName ?? '',
        highSchoolCity: locals.talent.highSchoolCity ?? '',
        highSchoolUai: locals.talent.highSchoolUai ?? '',
      },
    };
  }

  if (step === 'interests') {
    const [techInterests, generalInterests, existingTech, existingGeneral] =
      await Promise.all([
        prisma.interest.findMany({
          where: { kind: 'tech' },
          orderBy: { order: 'asc' },
        }),
        prisma.interest.findMany({
          where: { kind: 'general' },
          orderBy: { order: 'asc' },
        }),
        prisma.talentInterest.findMany({
          where: { talentId: locals.talent.id, interest: { kind: 'tech' } },
          select: { interestId: true },
        }),
        prisma.talentInterest.findMany({
          where: { talentId: locals.talent.id, interest: { kind: 'general' } },
          select: { interestId: true },
        }),
      ]);

    return {
      step,
      techInterests,
      generalInterests,
      selectedTechIds: existingTech.map((e) => e.interestId),
      selectedGeneralIds: existingGeneral.map((e) => e.interestId),
      freeText: locals.talent.interestsFreeText ?? '',
    };
  }

  if (step === 'equipment') {
    return {
      step,
      hasLaptop: locals.talent.hasLaptop,
      setupDescription: locals.talent.setupDescription ?? '',
    };
  }

  // step === 'rules'
  return { step };
};

export const actions: Actions = {
  validateProfile: async ({ request, locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const formData = await request.formData();
    const raw = Object.fromEntries(formData);
    const result = profileSchema.safeParse(raw);

    if (!result.success) {
      return fail(400, {
        step: 'profile' as const,
        errors: result.error.flatten().fieldErrors,
        values: raw as Record<string, string>,
      });
    }

    const now = new Date();

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: {
        civilite: result.data.civilite,
        nom: result.data.nom,
        prenom: result.data.prenom,
        phone: result.data.phone || null,
        parentType: result.data.parentType,
        parentCivilite: result.data.parentCivilite,
        parentNom: result.data.parentNom,
        parentPrenom: result.data.parentPrenom,
        parentEmail: result.data.parentEmail.toLowerCase().trim(),
        parentPhone: result.data.parentPhone || null,
        parent2Type: result.data.parent2Type || null,
        parent2Civilite: result.data.parent2Civilite || null,
        parent2Nom: result.data.parent2Nom || null,
        parent2Prenom: result.data.parent2Prenom || null,
        parent2Email: result.data.parent2Email
          ? result.data.parent2Email.toLowerCase().trim()
          : null,
        parent2Phone: result.data.parent2Phone || null,
        highSchoolName: result.data.highSchoolName,
        highSchoolCity: result.data.highSchoolCity || null,
        highSchoolUai: result.data.highSchoolUai || null,
        infoValidatedAt: now,
        highSchoolValidatedAt: now,
      },
    });

    // Create/update parent 1 bauth_user + send welcome email (fire-and-forget)
    if (result.data.parentEmail) {
      const parentEmail = result.data.parentEmail.toLowerCase().trim();
      (async () => {
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
        await sendParentWelcomeEmail(
          parentEmail,
          result.data.parentNom,
          locals.talent!.prenom,
        );
      })().catch((err) =>
        console.error('Failed to send parent 1 welcome email:', err),
      );
    }

    // Create/update parent 2 bauth_user + send welcome email (fire-and-forget)
    if (result.data.parent2Email) {
      const parent2Email = result.data.parent2Email.toLowerCase().trim();
      (async () => {
        let parent2User = await prisma.bauth_user.findUnique({
          where: { email: parent2Email },
        });
        if (!parent2User) {
          parent2User = await prisma.bauth_user.create({
            data: {
              email: parent2Email,
              name: `${result.data.parent2Prenom} ${result.data.parent2Nom}`,
              role: 'parent',
              emailVerified: true,
            },
          });
        } else {
          await prisma.bauth_user.update({
            where: { id: parent2User.id },
            data: {
              name: `${result.data.parent2Prenom} ${result.data.parent2Nom}`,
            },
          });
        }
        await sendParentWelcomeEmail(
          parent2Email,
          result.data.parent2Nom ?? '',
          locals.talent!.prenom,
        );
      })().catch((err) =>
        console.error('Failed to send parent 2 welcome email:', err),
      );
    }

    throw redirect(303, resolve('/onboarding'));
  },

  validateInterests: async ({ request, locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const formData = await request.formData();
    const raw = {
      techInterestIds: formData.getAll('techInterestIds'),
      generalInterestIds: formData.getAll('generalInterestIds'),
      freeText: formData.get('freeText') as string,
    };
    const result = interestsSchema.safeParse(raw);

    if (!result.success) {
      return fail(400, {
        step: 'interests' as const,
        error: result.error.issues[0]?.message ?? 'Sélection invalide.',
      });
    }

    // Verify all IDs exist
    const [techCount, generalCount] = await Promise.all([
      prisma.interest.count({
        where: { id: { in: result.data.techInterestIds }, kind: 'tech' },
      }),
      prisma.interest.count({
        where: {
          id: { in: result.data.generalInterestIds },
          kind: 'general',
        },
      }),
    ]);

    if (techCount !== result.data.techInterestIds.length) {
      return fail(400, {
        step: 'interests' as const,
        error: "Certains domaines tech sélectionnés n'existent plus.",
      });
    }
    if (generalCount !== result.data.generalInterestIds.length) {
      return fail(400, {
        step: 'interests' as const,
        error: "Certains centres d'intérêt sélectionnés n'existent plus.",
      });
    }

    const now = new Date();
    const allIds = [
      ...result.data.techInterestIds,
      ...result.data.generalInterestIds,
    ];

    await prisma.$transaction([
      prisma.talentInterest.deleteMany({
        where: { talentId: locals.talent.id },
      }),
      prisma.talentInterest.createMany({
        data: allIds.map((interestId) => ({
          talentId: locals.talent!.id,
          interestId,
        })),
      }),
      prisma.talent.update({
        where: { id: locals.talent.id },
        data: {
          techInterestsValidatedAt: now,
          generalInterestsValidatedAt: now,
          interestsRecapSeenAt: now,
          interestsFreeText: result.data.freeText || null,
        },
      }),
    ]);

    throw redirect(303, resolve('/onboarding'));
  },

  validateEquipment: async ({ request, locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const formData = await request.formData();
    const raw = Object.fromEntries(formData);
    const result = equipmentSchema.safeParse(raw);

    if (!result.success) {
      return fail(400, {
        step: 'equipment' as const,
        error: result.error.issues[0]?.message ?? 'Données invalides.',
      });
    }

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: {
        hasLaptop: result.data.hasLaptop,
        setupDescription: result.data.setupDescription || null,
        equipmentValidatedAt: new Date(),
      },
    });

    throw redirect(303, resolve('/onboarding'));
  },

  goBack: async ({ locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const step = getCurrentStep(locals.talent);

    const clearFields: Record<string, null> = {};

    switch (step) {
      case 'interests':
        clearFields.infoValidatedAt = null;
        clearFields.highSchoolValidatedAt = null;
        break;
      case 'equipment':
        clearFields.techInterestsValidatedAt = null;
        clearFields.generalInterestsValidatedAt = null;
        clearFields.interestsRecapSeenAt = null;
        break;
      case 'rules':
        clearFields.equipmentValidatedAt = null;
        break;
      default:
        throw redirect(303, resolve('/onboarding'));
    }

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: clearFields,
    });

    throw redirect(303, resolve('/onboarding'));
  },

  signRules: async ({ request, locals }) => {
    if (!locals.talent) {
      throw error(401, 'Non autorisé');
    }

    const formData = await request.formData();
    const city = (formData.get('city') as string)?.trim();

    if (!city) {
      return fail(400, {
        step: 'rules' as const,
        error: 'Veuillez indiquer la ville.',
      });
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

    await prisma.$transaction(async (tx) => {
      await tx.talent.update({
        where: { id: locals.talent!.id },
        data: {
          rulesSignedAt: now,
          rulesFilePath: key,
          charterAcceptedAt: now,
        },
      });
      await grantXp(tx, {
        talentId: locals.talent!.id,
        source: 'onboarding',
        sourceId: locals.talent!.id,
        amount: WELCOME_XP_BONUS,
      });
    });

    // Head to the dashboard with the one-shot celebration signal. If a CMS
    // welcome message exists, the guard intercepts to /welcome first; that page
    // re-emits `?welcome=1` after the read, so the celebration fires either way.
    throw redirect(303, resolve('/?welcome=1'));
  },
};
