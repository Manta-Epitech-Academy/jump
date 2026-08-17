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
import { resolveSchoolByUai } from '$lib/server/services/schoolService';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { upsertSchoolingYearRecord } from '$lib/server/services/schoolingService';
import { getOnboardingStep } from '$lib/domain/talentOnboarding';
import { runOnboardingPdfJob } from '$lib/server/services/onboardingPdfJobService';
import {
  ensureParentAccount,
  validateTalentInterests,
  signOnboardingRules,
} from '$lib/server/services/onboardingService';
import {
  captureOnboardingReturn,
  consumeOnboardingReturn,
} from '$lib/server/auth/loginRedirect';
import { signalArrivalCelebration } from '$lib/server/talent/arrivalCelebration';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const step = getOnboardingStep(locals.talent);

  if (!step) {
    throw redirect(303, resolve('/'));
  }

  // Stash the page the talent was heading for when a guard bounced them here
  // (e.g. an émargement QR scanned pre-onboarding), to resume on completion. A
  // no-op without the `?redirect=` param, so the per-step reloads don't clear it.
  captureOnboardingReturn(url, cookies);

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

    const talentId = locals.talent.id;
    const currentSchoolYear = schoolYearOf(new Date(), 'Europe/Paris').label;

    await prisma.$transaction(async (tx) => {
      // schoolId is the cached projection of Schooling_YearRecord (schoolingService),
      // never written to Talent directly - otherwise the current year's ledger row
      // goes stale the moment the talent corrects their SF-claimed school.
      await upsertSchoolingYearRecord(tx, {
        talentId,
        schoolYear: currentSchoolYear,
        schoolId,
        source: 'onboarding',
      });

      await tx.talent.update({
        where: { id: talentId },
        data: {
          highSchoolNameManual: schoolId ? null : result.data.schoolName,
          highSchoolValidatedAt: new Date(),
        },
      });
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

    const parentEmail = result.data.parentEmail.toLowerCase().trim();

    // Provision the parent-1 login first, so a validated address always has a
    // working parent account (the welcome link / co-signature flow are useless
    // without one). `refused` means the address already belongs to another
    // (non-parent) Jump account — a student's or a staff member's: one email is
    // one account with one role, so it can never also host a parent login.
    // Reject the step before anything is persisted and tell the talent to use a
    // different address, rather than silently leave the parent unable to connect.
    const provisioned = await ensureParentAccount({
      email: parentEmail,
      prenom: result.data.parentPrenom,
      nom: result.data.parentNom,
    });
    if (provisioned === 'refused') {
      return fail(400, {
        step: 'parents' as const,
        errors: {
          parentEmail: [
            'Cette adresse est déjà associée à un autre compte Jump. Indique une autre adresse e-mail pour ton responsable.',
          ],
        },
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
        parentEmail,
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

    // Welcome carries the passwordless magic link into the parent space; it's
    // fire-and-forget (the only slow step) so a mail hiccup never blocks the
    // talent's onboarding. A re-submit / back-and-forth doesn't re-send: the
    // address is skipped when it was already stored on the talent before this
    // submit. Parent 2 is persisted above as onboarding-collected data only — no
    // account, no email, no portal access (the whole parent flow is parent-1).
    const alreadyWelcomed =
      (locals.talent.parentEmail ?? '').toLowerCase().trim() === parentEmail;
    if (!alreadyWelcomed) {
      void sendParentWelcomeEmail(
        parentEmail,
        result.data.parentNom,
        locals.talent.prenom,
        locals.talent.id,
      ).catch((err) =>
        console.error(`Failed to send parent welcome for ${parentEmail}:`, err),
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

    const saved = await validateTalentInterests(locals.talent.id, {
      techInterestIds: result.data.techInterestIds,
      generalInterestIds: result.data.generalInterestIds,
      freeText: result.data.freeText,
    });

    if (!saved.ok) {
      return fail(400, {
        step: 'interests' as const,
        error:
          saved.reason === 'stale_tech'
            ? "Certains domaines tech sélectionnés n'existent plus."
            : "Certains centres d'intérêt sélectionnés n'existent plus.",
      });
    }

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

  signRules: async ({ request, locals, cookies }) => {
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

    const { jobId } = await signOnboardingRules({
      talentId: locals.talent.id,
      studentName: `${locals.talent.prenom} ${locals.talent.nom}`,
      city: result.data.city,
    });

    // Generate the PDF + upload to S3 in the background — NOT awaited, so the
    // student reaches the dashboard immediately and the file lands a few seconds
    // later. Failures are visible and re-runnable at /staff/admin/onboarding-pdfs.
    void runOnboardingPdfJob(jobId);

    // Arm the arrival celebration (fired on the next dashboard load), then resume
    // the page the talent was heading for when onboarding interrupted them (e.g.
    // the émargement check-in), else fall back to the dashboard. The celebration
    // rides a cookie, not a `?welcome=1` param, so it survives the resume detour
    // through the check-in instead of being lost with the param. The welcome
    // splash already ran before onboarding (so `welcomeSeenAt` is set), which
    // means the welcome guard won't re-intercept either redirect.
    signalArrivalCelebration(cookies);
    const resume = consumeOnboardingReturn(cookies);
    throw redirect(303, resume ?? resolve('/'));
  },
};
