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

  await prisma.$transaction([
    prisma.talentInterest.deleteMany({ where: { talentId } }),
    prisma.talentInterest.createMany({
      data: allIds.map((interestId) => ({ talentId, interestId })),
    }),
    prisma.talent.update({
      where: { id: talentId },
      data: {
        techInterestsValidatedAt: now,
        generalInterestsValidatedAt: now,
        interestsRecapSeenAt: now,
        interestsFreeText: input.freeText || null,
      },
    }),
  ]);

  return { ok: true };
}

/**
 * Close onboarding: stamp the signature + charter, grant the arrival XP facts,
 * and enqueue the signed-rules PDF — all in one transaction of fast DB writes,
 * so the caller can redirect immediately and run the PDF out of band.
 *
 * Returns the enqueued job's id; the caller kicks off `runOnboardingPdfJob`
 * without awaiting it (the generation + S3 upload is the only slow part, and it
 * must not sit between the talent and their dashboard).
 */
export async function signOnboardingRules(input: {
  talentId: string;
  studentName: string;
  city: string;
  signedAt?: Date;
}): Promise<{ jobId: string }> {
  const { talentId, studentName, city } = input;
  const now = input.signedAt ?? new Date();

  const job = await prisma.$transaction(async (tx) => {
    // Resolve the talent's campus (most-recent participation) and their 0-based
    // position among completers in that campus, BEFORE stamping this talent's
    // own rulesSignedAt below — so the count is "those who finished before me".
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

  return { jobId: job.id };
}
