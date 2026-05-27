import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import {
  identitySchema,
  schoolSchema,
  parentsSchema,
  interestsSchema,
  equipmentSchema,
  rulesSchema,
} from '$lib/validation/onboarding';
import { sendParentWelcomeEmail } from '$lib/server/otp';
import { WELCOME_XP_BONUS } from '$lib/domain/xp';
import { grantXp } from '$lib/server/services/xpService';
import { resolveSchoolByUai } from '$lib/server/services/schoolService';
import {
  getOnboardingStep,
  type OnboardingStep,
} from '$lib/domain/talentOnboarding';
import {
  enqueueOnboardingPdfJob,
  runOnboardingPdfJob,
} from '$lib/server/services/onboardingPdfJobService';

// Re-exported for the `./$types`-typed action handlers that key off the step.
export type { OnboardingStep };

type ParentContact = { email: string; prenom: string; nom: string };

/**
 * Provision (or refresh) a parent's `bauth_user` and, the first time we see the
 * address for this talent, send the welcome email. `alreadyWelcomed` is true
 * when the address was already stored on the talent before this submit — that
 * covers plain re-submits and the back-and-forth case (going back from the
 * interests step clears `parentsValidatedAt` but leaves the parent email
 * untouched), which is what was sending the welcome twice.
 *
 * The bauth_user upsert always runs so a corrected name still propagates; only
 * the email send is gated.
 */
async function provisionParentAccount(
  parent: ParentContact,
  childPrenom: string,
  talentId: string,
  alreadyWelcomed: boolean,
): Promise<void> {
  const name = `${parent.prenom} ${parent.nom}`.trim();
  const existing = await prisma.bauth_user.findUnique({
    where: { email: parent.email },
  });
  if (!existing) {
    await prisma.bauth_user.create({
      data: { email: parent.email, name, role: 'parent', emailVerified: true },
    });
  } else {
    await prisma.bauth_user.update({
      where: { id: existing.id },
      data: { name },
    });
  }

  // Welcome carries a passwordless magic link into the parent space; the
  // bauth_user provisioned just above lets /parent/fastlogin resolve it.
  if (!alreadyWelcomed) {
    await sendParentWelcomeEmail(
      parent.email,
      parent.nom,
      childPrenom,
      talentId,
    );
  }
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const step = getOnboardingStep(locals.talent);

  if (!step) {
    throw redirect(303, resolve('/'));
  }

  // The three personal steps (identity / school / parents) share one combined
  // profile payload: each renders a slice of it, so the load shape stays unified
  // and the Svelte props stay simple.
  if (step === 'identity' || step === 'school' || step === 'parents') {
    const user = locals.user!;
    // Pre-fill the lycée from the talent's current School (seeded from Salesforce
    // before onboarding), falling back to the free-text name when there's no UAI.
    const school = locals.talent.schoolId
      ? await prisma.school.findUnique({
          where: { id: locals.talent.schoolId },
          select: { uai: true, name: true, city: true },
        })
      : null;

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
        schoolUai: school?.uai ?? '',
        schoolName: school?.name ?? locals.talent.highSchoolNameManual ?? '',
        schoolCity: school?.city ?? '',
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
      // Seeds a per-talent stable shuffle: chip order varies across the cohort
      // (anti-bias) but stays put across reloads for one student.
      shuffleSeed: locals.talent.id,
    };
  }

  if (step === 'equipment') {
    return {
      step,
      hasLaptop: locals.talent.hasLaptop,
      setupDescription: locals.talent.setupDescription ?? '',
    };
  }

  return { step };
};

export const actions: Actions = {
  validateIdentity: async ({ request, locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const formData = await request.formData();
    const raw = Object.fromEntries(formData);
    const result = identitySchema.safeParse(raw);

    if (!result.success) {
      return fail(400, {
        step: 'identity' as const,
        errors: result.error.flatten().fieldErrors,
        values: raw as Record<string, string>,
      });
    }

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: {
        civilite: result.data.civilite,
        nom: result.data.nom,
        prenom: result.data.prenom,
        phone: result.data.phone || null,
        infoValidatedAt: new Date(),
      },
    });

    return { success: true };
  },

  validateSchool: async ({ request, locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const formData = await request.formData();
    const raw = Object.fromEntries(formData);
    const result = schoolSchema.safeParse(raw);

    if (!result.success) {
      return fail(400, {
        step: 'school' as const,
        errors: result.error.flatten().fieldErrors,
        values: raw as Record<string, string>,
      });
    }

    // A UAI resolves to a canonical School (lazy-created); without one we keep the
    // typed name in the free-text fallback. This is the talent's confirmed lycée
    // (Jump truth) — the optimistic write that may later diverge from Salesforce.
    const schoolId = result.data.schoolUai
      ? await resolveSchoolByUai(result.data.schoolUai, result.data.schoolName)
      : null;

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: {
        schoolId,
        highSchoolNameManual: schoolId ? null : result.data.schoolName,
        highSchoolValidatedAt: new Date(),
      },
    });

    return { success: true };
  },

  validateParents: async ({ request, locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const formData = await request.formData();
    const raw = Object.fromEntries(formData);

    // Identity is already persisted by this step, so the parent-vs-student
    // cross-field checks compare against the talent's confirmed email/phone,
    // injected here rather than re-submitted by the form.
    raw.studentEmail = locals.user!.email;
    raw.studentPhone = locals.talent.phone || '';

    const result = parentsSchema.safeParse(raw);

    if (!result.success) {
      return fail(400, {
        step: 'parents' as const,
        errors: result.error.flatten().fieldErrors,
        values: raw as Record<string, string>,
      });
    }

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: {
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
        parentsValidatedAt: new Date(),
      },
    });

    // Provision the parent bauth_user(s) + send the welcome email
    // (fire-and-forget). Addresses already welcomed before this submit are
    // skipped, and the two parent slots are deduped by address — so neither a
    // re-submit / back-and-forth nor entering the same email for both parents
    // can send the welcome twice.
    const alreadyWelcomed = new Set(
      [locals.talent.parentEmail, locals.talent.parent2Email]
        .filter((e): e is string => !!e)
        .map((e) => e.toLowerCase().trim()),
    );
    const parents: ParentContact[] = [
      {
        email: result.data.parentEmail.toLowerCase().trim(),
        prenom: result.data.parentPrenom,
        nom: result.data.parentNom,
      },
      ...(result.data.parent2Email
        ? [
            {
              email: result.data.parent2Email.toLowerCase().trim(),
              prenom: result.data.parent2Prenom ?? '',
              nom: result.data.parent2Nom ?? '',
            },
          ]
        : []),
    ];

    const childPrenom = locals.talent.prenom;
    const talentId = locals.talent.id;
    const seen = new Set<string>();
    for (const parent of parents) {
      if (!parent.email || seen.has(parent.email)) continue;
      seen.add(parent.email);
      void provisionParentAccount(
        parent,
        childPrenom,
        talentId,
        alreadyWelcomed.has(parent.email),
      ).catch((err) =>
        console.error(
          `Failed to provision parent account for ${parent.email}:`,
          err,
        ),
      );
    }

    // No redirect: a redirect to the same /onboarding URL doesn't re-render
    // under use:enhance (the client never picks up the advanced step). The form's
    // enhance callback calls invalidateAll() on success to rerun load instead.
    return { success: true };
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

    const [techCount, generalCount] = await Promise.all([
      prisma.interest.count({
        where: { id: { in: result.data.techInterestIds }, kind: 'tech' },
      }),
      prisma.interest.count({
        where: { id: { in: result.data.generalInterestIds }, kind: 'general' },
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

    return { success: true };
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

    return { success: true };
  },

  advanceProcessing: async ({ locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: { processingCompletedAt: new Date() },
    });

    return { success: true };
  },

  goBack: async ({ locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const step = getOnboardingStep(locals.talent);
    const clearFields: Record<string, null> = {};

    switch (step) {
      case 'school':
        clearFields.infoValidatedAt = null;
        break;
      case 'parents':
        clearFields.highSchoolValidatedAt = null;
        break;
      case 'interests':
        clearFields.parentsValidatedAt = null;
        break;
      case 'equipment':
        clearFields.techInterestsValidatedAt = null;
        clearFields.generalInterestsValidatedAt = null;
        clearFields.interestsRecapSeenAt = null;
        break;
      case 'processing':
        clearFields.equipmentValidatedAt = null;
        break;
      case 'rules':
        // `processing` is a non-navigable auto-advancing interstitial (it
        // re-submits itself on mount), so it can't be a back target — landing on
        // it just replays the animation and bounces straight back to rules.
        // Rewind past it to the last real input step (equipment), clearing both
        // gates so the timestamp chain stays monotonic.
        clearFields.processingCompletedAt = null;
        clearFields.equipmentValidatedAt = null;
        break;
      default:
        return { success: true };
    }

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: clearFields,
    });

    return { success: true };
  },

  signRules: async ({ request, locals }) => {
    if (!locals.talent) {
      throw error(401, 'Non autorisé');
    }

    const formData = await request.formData();
    const raw = Object.fromEntries(formData);
    const result = rulesSchema.safeParse(raw);

    if (!result.success) {
      return fail(400, {
        step: 'rules' as const,
        error: result.error.issues[0]?.message ?? 'Données invalides.',
      });
    }

    const { city } = result.data;
    const now = new Date();
    const talentId = locals.talent.id;
    const studentName = `${locals.talent.prenom} ${locals.talent.nom}`;

    // Set timestamps, grant XP, and enqueue the PDF job atomically — all fast
    // DB writes, so the redirect below is instant.
    const job = await prisma.$transaction(async (tx) => {
      await tx.talent.update({
        where: { id: talentId },
        data: {
          rulesSignedAt: now,
          charterAcceptedAt: now,
        },
      });
      await grantXp(tx, {
        talentId,
        source: 'onboarding',
        sourceId: talentId,
        amount: WELCOME_XP_BONUS,
      });
      return enqueueOnboardingPdfJob(tx, {
        talentId,
        documentType: 'rules',
        payload: { studentName, city, signedAt: now.toISOString() },
      });
    });

    // Generate the PDF + upload to S3 in the background — NOT awaited, so the
    // student reaches the dashboard immediately and the file lands a few seconds
    // later. Failures are visible and re-runnable at /staff/admin/onboarding-pdfs.
    void runOnboardingPdfJob(job.id);

    // Head to the dashboard with the one-shot arrival-celebration signal. The
    // welcome splash already ran before onboarding (so `welcomeSeenAt` is set),
    // which means the welcome guard won't re-intercept this redirect.
    throw redirect(303, resolve('/?welcome=1'));
  },
};
