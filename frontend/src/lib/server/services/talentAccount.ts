import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { revokeXp } from '$lib/server/services/xpService';
import {
  clearOnboardingTimestamps,
  clearTalentOnboardingArtifacts,
} from '$lib/domain/talentOnboarding';

/**
 * Ensure a talent has a linked `bauth_user` and return its id.
 *
 * Seeded / Salesforce-imported talents exist as `Talent` rows long before they
 * ever sign in, so they carry no `bauth_user`. Every flow that needs a real
 * auth identity for them — OTP login, fastlogin links, admin impersonation —
 * has to bootstrap that user first. This is the single place that does it:
 * reuse an existing `bauth_user` with the same email if one is around (e.g.
 * created by a sibling flow), otherwise create one, then link it back.
 *
 * Throws if the talent has neither a linked user nor an email — without an
 * email BetterAuth has no identifier to hang a sign-in identity off.
 */
export async function ensureTalentUser(talentId: string): Promise<string> {
  const talent = await prisma.talent.findUniqueOrThrow({
    where: { id: talentId },
    select: { id: true, userId: true, email: true, prenom: true, nom: true },
  });
  if (talent.userId) return talent.userId;

  const email = talent.email?.toLowerCase().trim();
  if (!email) {
    throw new Error(
      "Le talent n'a pas d'adresse email — impossible de créer un compte de connexion.",
    );
  }

  const existing = await prisma.bauth_user.findUnique({
    where: { email },
    select: { id: true },
  });
  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    try {
      userId = (
        await prisma.bauth_user.create({
          data: {
            email,
            role: 'student',
            name: `${talent.prenom} ${talent.nom}`,
          },
          select: { id: true },
        })
      ).id;
    } catch (err) {
      // Lost a create race with a sibling flow firing for the same talent at
      // once (login / fastlogin / impersonate): the email-unique constraint
      // tripped. The winner's row exists now — adopt it instead of failing.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        userId = (
          await prisma.bauth_user.findUniqueOrThrow({
            where: { email },
            select: { id: true },
          })
        ).id;
      } else {
        throw err;
      }
    }
  }

  await prisma.talent.update({
    where: { id: talent.id },
    data: { userId },
  });
  return userId;
}

/**
 * Reset a talent to its pre-onboarding state so the whole flow (infos, lycée,
 * intérêts, règlement, charte) and the arrival celebration can be walked again.
 * This is a dev/QA affordance behind the admin-only impersonation page.
 *
 * Mirrors the inverse of the talent's own onboarding writes: nulls every gate
 * timestamp the guard checks (plus `welcomeSeenAt`), drops the talent's signed-
 * document artifacts so a stale PDF never outlives the signature it attests
 * (`TALENT_ONBOARDING_ARTIFACT_FIELDS`), and revokes the onboarding XP grant so
 * a re-run nets back to the same XP rather than stacking the bonus each time.
 *
 * Deliberately scoped to the talent. Profile data they filled in (school,
 * parents, interests, equipment) is kept — the steps pre-fill from it, which is
 * the realistic returning-talent experience. Parent-owned facts are left
 * untouched too: the guardian's règlement co-signature (`parentRules*`) and the
 * parent-decided image-rights stand on their own flows, not on the talent's
 * onboarding, so a talent reset must not void them.
 */
export async function resetTalentOnboarding(talentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.talent.update({
      where: { id: talentId },
      data: {
        ...clearOnboardingTimestamps(),
        ...clearTalentOnboardingArtifacts(),
      },
    });
    // Idempotent: drops the onboarding grant if present, no-op otherwise — so a
    // re-run nets back to the same XP rather than stacking the bonus, and the
    // old `charterAcceptedAt` guard is no longer needed.
    await revokeXp(tx, { talentId, source: 'onboarding', sourceId: talentId });
  });
}
