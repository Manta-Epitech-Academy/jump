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
import {
  WELCOME_XP_BONUS,
  onboardingEarlyBirdBonus,
  ONBOARDING_EARLY_BIRD_LIMIT,
} from '$lib/domain/xp';
import { grantXp } from '$lib/server/services/xpService';
import {
  resolveTalentCampus,
  countCampusEarlyBirdPosition,
} from '$lib/server/services/talentCampus';
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
  if (existing && existing.role !== 'parent') {
    // The address already belongs to a NON-parent login: a student's or staff's
    // account (bad data, e.g. a family sharing one address so a parent contact
    // email is also someone's student email). Don't repurpose it: renaming their
    // account to the parent's name would pollute their identity, and the welcome
    // magic link would be refused anyway (/parent/fastlogin filters by
    // role: 'parent'). So we leave it untouched and warn. Note this is NOT caught
    // by the admin auth-conflicts tool (that surface only classifies
    // Talent.userId vs Talent.email drift), so without the warning the parent
    // would silently get no account until the shared address is fixed at source.
    console.warn(
      `Parent account not provisioned for talent ${talentId}: "${parent.email}" already belongs to a non-parent (${existing.role}) account; skipping to avoid hijacking it.`,
    );
    return;
  }
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

    // Provision the parent-1 bauth_user + send the welcome email
    // (fire-and-forget). A re-submit / back-and-forth doesn't re-send: the
    // address is skipped when it was already stored on the talent before this
    // submit. Parent 2 is persisted above as onboarding-collected data only — no
    // account, no email, no portal access (the whole parent flow is parent-1).
    const parentEmail = result.data.parentEmail.toLowerCase().trim();
    const alreadyWelcomed =
      (locals.talent.parentEmail ?? '').toLowerCase().trim() === parentEmail;

    void provisionParentAccount(
      {
        email: parentEmail,
        prenom: result.data.parentPrenom,
        nom: result.data.parentNom,
      },
      locals.talent.prenom,
      locals.talent.id,
      alreadyWelcomed,
    ).catch((err) =>
      console.error(
        `Failed to provision parent account for ${parentEmail}:`,
        err,
      ),
    );

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
      // Resolve the talent's campus (most-recent participation) and their
      // 0-based position among completers in that campus, BEFORE stamping this
      // talent's own rulesSignedAt below — so the count is "those who finished
      // before me". The position query holds a per-campus advisory lock for the
      // rest of this transaction, so concurrent completions can't tie for the
      // same tier. A campus-less talent (no participation yet) earns no
      // early-bird: you can't be Nth in a campus you don't have, and with no
      // campus there's nothing to serialize on.
      const { campusId } = await resolveTalentCampus(tx, talentId);
      const earlyBirdBonus = campusId
        ? onboardingEarlyBirdBonus(
            await countCampusEarlyBirdPosition(
              tx,
              campusId,
              ONBOARDING_EARLY_BIRD_LIMIT,
            ),
          )
        : 0;

      await tx.talent.update({
        where: { id: talentId },
        data: {
          rulesSignedAt: now,
          rulesSignedCity: city,
          charterAcceptedAt: now,
        },
      });
      await grantXp(tx, {
        talentId,
        source: 'onboarding',
        sourceId: talentId,
        amount: WELCOME_XP_BONUS,
        campusId,
      });
      // Layered bonus fact for the earliest finishers in the campus — separate
      // from the base so the arrival reward stays explainable and the tier is
      // auditable. Idempotent on (onboarding_early_bird, talentId).
      if (earlyBirdBonus > 0) {
        await grantXp(tx, {
          talentId,
          source: 'onboarding_early_bird',
          sourceId: talentId,
          amount: earlyBirdBonus,
          campusId,
        });
      }
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
