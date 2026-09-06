/**
 * Transactional writes behind the talent onboarding wizard.
 *
 * The wizard's per-step timestamp stamps stay inline in the route (single-model
 * one-liners); what lives here is the logic that spans models and must be
 * atomic: provisioning the parent-1 login, swapping the interest selection, and
 * the rules signature (timestamps + layered XP facts + PDF job in one
 * transaction).
 *
 * HTTP concerns stay in the route: redirect target, the resume cookie, and the
 * arrival celebration.
 */

import { prisma } from '$lib/server/db';
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
import { enqueueOnboardingPdfJob } from '$lib/server/services/onboardingPdfJobService';
import type { ServiceResult } from './result';
import { CURRENT_REGLEMENT_VERSION } from '$lib/content/reglement';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';
import {
  patchCurrentOnboardingRecord,
  upsertOnboardingYearRecord,
} from './onboardingYearService';

type ParentContact = { email: string; prenom: string; nom: string };

export type EnsureParentResult = 'created' | 'refreshed' | 'refused';

/**
 * Ensure parent-1's `bauth_user` exists (role `parent`, verified) and carries
 * the latest name. Awaited by the parents step: a validated address must always
 * end up with a working login, so this can't be fire-and-forget. The name upsert
 * always runs so a corrected name still propagates.
 *
 * Returns `'refused'` when the address already belongs to a NON-parent login (a
 * student's or staff member's account). One email = one `bauth_user` = one role,
 * so we can't also mint a parent login there; repurposing theirs would pollute
 * their identity, and the welcome magic link would be rejected anyway
 * (`/parent/fastlogin` filters by `role: 'parent'`). This function is the only
 * gate for that collision: the parents step runs no up-front email-availability
 * check, so `'refused'` is an ordinary, if uncommon, outcome (a family sharing
 * one inbox that already backs another student's login, or a parent who is also
 * Epitech staff), not a race.
 *
 * The caller rejects the step on `'refused'` and asks the talent for another
 * address instead of persisting and advancing. The parent portal carries the
 * règlement co-signature and the image-rights decision (an RGPD / legal step),
 * so a parent left with no account is a silently broken flow, not a cosmetic
 * gap. This replaces an earlier silent pass that only logged a warning and
 * stranded the parent until the shared address was fixed at source.
 */
export async function ensureParentAccount(
  parent: ParentContact,
): Promise<EnsureParentResult> {
  const name = `${parent.prenom} ${parent.nom}`.trim();
  const existing = await prisma.bauth_user.findUnique({
    where: { email: parent.email },
    select: { id: true, role: true },
  });
  if (existing && existing.role !== 'parent') return 'refused';
  if (!existing) {
    await prisma.bauth_user.create({
      data: { email: parent.email, name, role: 'parent', emailVerified: true },
    });
    return 'created';
  }
  await prisma.bauth_user.update({
    where: { id: existing.id },
    data: { name },
  });
  return 'refreshed';
}

export type InterestsFailure = 'stale_tech' | 'stale_general';

/**
 * Replace a talent's interest selection and stamp the interests steps done.
 *
 * The selection is a full swap (deleteMany + createMany), not a diff: the form
 * always posts the complete set, so a diff would only add a way for the two to
 * disagree. Ids are checked against the catalogue first, per kind, so a chip
 * deleted by staff mid-session fails the step loudly instead of silently
 * dropping.
 */
export async function validateTalentInterests(
  talentId: string,
  input: {
    techInterestIds: string[];
    generalInterestIds: string[];
    freeText?: string;
  },
): Promise<ServiceResult<InterestsFailure>> {
  const [techCount, generalCount] = await Promise.all([
    prisma.interest.count({
      where: { id: { in: input.techInterestIds }, kind: 'tech' },
    }),
    prisma.interest.count({
      where: { id: { in: input.generalInterestIds }, kind: 'general' },
    }),
  ]);

  if (techCount !== input.techInterestIds.length) {
    return { ok: false, reason: 'stale_tech' };
  }
  if (generalCount !== input.generalInterestIds.length) {
    return { ok: false, reason: 'stale_general' };
  }

  const now = new Date();
  const allIds = [...input.techInterestIds, ...input.generalInterestIds];

  await prisma.$transaction(async (tx) => {
    await tx.talentInterest.deleteMany({ where: { talentId } });
    await tx.talentInterest.createMany({
      data: allIds.map((interestId) => ({ talentId, interestId })),
    });
    // The selection itself is the talent's current preference and stays flat;
    // the step's gates belong to this year's dossier.
    await tx.talent.update({
      where: { id: talentId },
      data: { interestsFreeText: input.freeText || null },
    });
    await patchCurrentOnboardingRecord(tx, talentId, {
      techInterestsValidatedAt: now,
      generalInterestsValidatedAt: now,
      interestsRecapSeenAt: now,
    });
  });

  return { ok: true };
}

/**
 * Close onboarding: stamp the signature + charter, grant the arrival XP facts,
 * and enqueue the signed-rules PDF, all in one transaction of fast DB writes,
 * so the caller can redirect immediately and run the PDF out of band.
 *
 * Returns the enqueued job's id; the caller kicks off `runOnboardingPdfJob`
 * without awaiting it (the generation + S3 upload is the only slow part, and it
 * must not sit between the talent and their dashboard).
 */
export async function signOnboardingRules(input: {
  talentId: string;
  city: string;
  signedAt?: Date;
}): Promise<{ jobId: string }> {
  const { talentId, city } = input;
  const now = input.signedAt ?? new Date();
  // One resolution for the dossier this act writes, the early-bird count and the
  // PDF job, so all three can never land on different years.
  const schoolYear = currentSchoolYearLabel();

  const job = await prisma.$transaction(async (tx) => {
    // Resolve the talent's campus (most-recent participation) and their 0-based
    // position among completers in that campus, BEFORE stamping this talent's
    // own rulesSignedAt below, so the count is "those who finished before me".
    // The position query holds a per-campus advisory lock for the rest of this
    // transaction, so concurrent completions can't tie for the same tier. A
    // campus-less talent (no participation yet) earns no early-bird: you can't
    // be Nth in a campus you don't have, and with no campus there's nothing to
    // serialize on.
    const { campusId } = await resolveTalentCampus(tx, talentId);
    const earlyBirdBonus = campusId
      ? onboardingEarlyBirdBonus(
          await countCampusEarlyBirdPosition(
            tx,
            campusId,
            schoolYear,
            ONBOARDING_EARLY_BIRD_LIMIT,
          ),
        )
      : 0;

    // The charte is a once-per-account consent, not part of the yearly dossier,
    // so it stays flat on `Talent` and a returning talent is not asked again.
    // `updateMany` with the null in the WHERE rather than a read-then-write: the
    // date somebody first consented is the auditable fact, and re-walking the
    // ladder for a new year must not restamp it. A no-op row count is the normal
    // outcome for a returning talent.
    await tx.talent.updateMany({
      where: { id: talentId, charterAcceptedAt: null },
      data: { charterAcceptedAt: now },
    });
    // The explicit year rather than `patchCurrentOnboardingRecord`, which would
    // resolve it a second time: the PDF job below names the dossier it renders,
    // and two resolutions either side of the 31 July cutover would point them at
    // different rows, failing the job on a dossier it cannot find.
    await upsertOnboardingYearRecord(tx, {
      talentId,
      schoolYear,
      patch: {
        rulesSignedAt: now,
        rulesSignedCity: city,
        // Pin the wording this signature commits to. Everything downstream
        // reads it back; nothing else ever writes it.
        reglementVersion: CURRENT_REGLEMENT_VERSION,
      },
    });
    await grantXp(tx, {
      talentId,
      source: 'onboarding',
      sourceId: talentId,
      amount: WELCOME_XP_BONUS,
      campusId,
    });
    // Layered bonus fact for the earliest finishers in the campus, separate
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
      // The dossier just signed, so a job that runs (or is retried) after the
      // 31 July cutover still renders this year's document rather than whichever
      // one is current when it finally gets a browser.
      schoolYear,
    });
  });

  return { jobId: job.id };
}
