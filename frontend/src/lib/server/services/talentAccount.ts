import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { isParentOrStaffEmail } from '$lib/server/auth/emailIdentity';
import { deleteAnonymizedDocuments } from '$lib/server/services/anonymizationService';
import {
  findUnreferencedParentAccount,
  deleteParentAccountCascade,
} from '$lib/server/services/parentAccount';
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
    select: {
      id: true,
      userId: true,
      email: true,
      prenom: true,
      nom: true,
      user: { select: { email: true } },
    },
  });

  // Already linked: reconcile the login email before returning. Salesforce can
  // change Talent.email after the link was made; the linked bauth_user.email
  // then goes stale and the student logs in "into the void" (BetterAuth resolves
  // OTP by bauth_user.email, while the dashboard loads by the linked account).
  // Realign it to Talent.email so the next OTP lands on this account. If another
  // account already holds the new email (P2002 — an orphan the student made via
  // direct OTP, or a Salesforce inversion), DON'T force it: leave the link as-is
  // for the admin auth-conflicts tool to arbitrate, and still return the current
  // id so this call never blocks a login.
  if (talent.userId) {
    const wanted = talent.email?.toLowerCase().trim();
    const current = talent.user?.email?.toLowerCase().trim();
    if (wanted && current && wanted !== current) {
      // Guard before realigning: `Talent.email` pointing at a parent or staff
      // address is bad SF data (a minor onboarded with a parent's email), NOT an
      // email change. Renaming the student's account onto it would steal that
      // parent/staff identity. Skip the rename and leave it for the admin
      // auth-conflicts tool, which surfaces it as PARENT_HOLDER / STAFF_HOLDER
      // (escalate, never force) — same stance as the adopt branch below.
      if (!(await isParentOrStaffEmail(wanted))) {
        try {
          await prisma.bauth_user.update({
            where: { id: talent.userId },
            data: { email: wanted },
          });
        } catch (err) {
          if (
            !(
              err instanceof Prisma.PrismaClientKnownRequestError &&
              err.code === 'P2002'
            )
          )
            throw err;
          // Collision → leave for manual resolution (see authIdentityService).
        }
      }
    }
    return talent.userId;
  }

  const email = talent.email?.toLowerCase().trim();
  if (!email) {
    throw new Error(
      "Le talent n'a pas d'adresse email — impossible de créer un compte de connexion.",
    );
  }

  const existing = await prisma.bauth_user.findUnique({
    where: { email },
    select: { id: true, role: true, staffProfile: { select: { id: true } } },
  });
  let userId: string;
  if (existing) {
    // Never adopt a parent or staff account as a student's login: that would
    // hand this talent's dashboard to whoever owns that email. An SF data
    // anomaly (a student carrying a parent/staff email) must be resolved by
    // hand, not papered over by silently linking.
    if (existing.staffProfile || existing.role === 'parent') {
      throw new Error(
        "L'adresse du talent correspond à un compte parent ou staff — résolution manuelle requise (conflit d'identité).",
      );
    }
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
 * Factory reset: bring a talent all the way back to the state the Salesforce
 * worker leaves them in on first import, and nothing more. The admin affordance
 * for cleaning up after testing the talent experience in prod (impersonate →
 * play minigames, onboard, upload, sign → wipe it all).
 *
 * What the worker import establishes, and what this keeps:
 *   - the `Talent` row's SF identity (`externalId`, `email`) and the columns the
 *     worker seeds from Salesforce (`nom`, `prenom`, `phone`, `civilite`,
 *     `niveau`, `schoolId`), re-seeded here from the `TalentSfImport` mirror,
 *     which is exactly what the worker would seed on a fresh create, so an
 *     onboarding edit to e.g. the phone is rolled back to SF's claim;
 *   - the SF mirror itself (`TalentSfImport`, worker-owned);
 *   - the `Participation` rows the worker upserts per event (the talent *was*
 *     imported into those events), reset to their import defaults, with every
 *     post-import child (`ParticipationActivity` verdicts, `StageCompliance`)
 *     dropped.
 *
 * Everything else a talent accrues after import is deleted: the XP ledger and
 * its cached projections (`xp`/`eventsCount` → 0), minigame attempts, quiz /
 * observable / competence state, steps progress, interviews (and their calendar
 * syncs, plus the audit trail of any admin reset), portfolio, interests,
 * reminders, PDF jobs, broadcast-recipient rows,
 * deletion requests, every onboarding/parent/image-rights/règlement column, and
 * the generated onboarding PDFs in object storage. The login identity goes too:
 * a freshly-imported talent has no `bauth_user` (their `userId` is null until a
 * first login or impersonation), so the linked user (and any parent account
 * minted during testing that no *other* talent still references) is deleted
 * along with its sessions/accounts.
 *
 * Contrast with `anonymizeTalent`: it scrubs identity to placeholders for RGPD
 * erasure but deliberately keeps the XP/stats and the account; this keeps the
 * identity and deliberately destroys the stats.
 *
 * S3 deletes run after the transaction commits (an external call inside the tx
 * would risk the interactive-tx timeout rolling back the DB reset), mirroring
 * `anonymizeTalent` → {@link deleteAnonymizedDocuments}.
 */
export async function resetTalentToImport(talentId: string): Promise<void> {
  const documentKeys = await prisma.$transaction(async (tx) => {
    const talent = await tx.talent.findUnique({
      where: { id: talentId },
      select: {
        nom: true,
        prenom: true,
        userId: true,
        parentEmail: true,
        parent2Email: true,
        charterFilePath: true,
        rulesFilePath: true,
        imageRightsFilePath: true,
        // The worker's source for the seed columns. When present, re-seeding the
        // Talent from it reproduces a fresh worker `talent.create`. It is present
        // for every SF talent (the worker creates it atomically with the row and
        // this reset never drops it), so SF talents always re-seed fully. Absent
        // only for a never-synced talent, whose lone creation path is the OAuth
        // callback (it sets just userId/email/nom/prenom): there the SF-seeded
        // profile columns (phone, civilite, niveau, schoolId) fall back to null,
        // which is exactly that bare non-SF create state, while nom/prenom are
        // kept as-is since there is no SF claim to revert them to.
        sfImport: {
          select: {
            nom: true,
            prenom: true,
            phone: true,
            civilite: true,
            niveau: true,
            sfSchoolId: true,
          },
        },
      },
    });
    if (!talent) return [];

    const sf = talent.sfImport;

    // Captured before the update nulls them, so the matching parent accounts can
    // be cleaned up afterwards (step 6) and the PDF objects deleted post-commit.
    const parentEmails = [talent.parentEmail, talent.parent2Email].filter(
      (e): e is string => !!e,
    );
    const documentKeys = [
      talent.charterFilePath,
      talent.rulesFilePath,
      talent.imageRightsFilePath,
    ].filter((k): k is string => !!k);

    // 1. Drop the post-import children hanging off the worker-created
    //    Participation rows (the rows themselves are kept, see step 3).
    const participations = await tx.participation.findMany({
      where: { talentId },
      select: { id: true },
    });
    const participationIds = participations.map((p) => p.id);
    if (participationIds.length > 0) {
      await tx.participationActivity.deleteMany({
        where: { participationId: { in: participationIds } },
      });
      await tx.stageCompliance.deleteMany({
        where: { participationId: { in: participationIds } },
      });
    }

    // 2. Delete every other talent-scoped record created after import.
    //    Broadcast recipients are matched on both the talent and parent-of
    //    slots (SetNull relations, so deleted explicitly rather than left
    //    orphaned).
    await tx.interview.deleteMany({ where: { talentId } });
    // The reset-audit trail is talent-scoped too (talentId + a free-text reason);
    // it must go with the interviews it traces, matching anonymizeTalent.
    await tx.interviewReset.deleteMany({ where: { talentId } });
    await tx.stepsProgress.deleteMany({ where: { talentId } });
    await tx.portfolioItem.deleteMany({ where: { talentId } });
    await tx.talentObservableState.deleteMany({ where: { talentId } });
    await tx.talentCompetenceState.deleteMany({ where: { talentId } });
    await tx.talentQuizAttempt.deleteMany({ where: { talentId } });
    await tx.talentInterest.deleteMany({ where: { talentId } });
    await tx.onboardingReminder.deleteMany({ where: { talentId } });
    await tx.onboardingPdfJob.deleteMany({ where: { talentId } });
    await tx.minigameAttempt.deleteMany({ where: { talentId } });
    await tx.xpGrant.deleteMany({ where: { talentId } });
    await tx.imageRightsDecisionRecord.deleteMany({ where: { talentId } });
    await tx.broadcastRecipient.deleteMany({
      where: { OR: [{ talentId }, { parentOfTalentId: talentId }] },
    });
    await tx.talentDeletionRequest.deleteMany({ where: { talentId } });
    // Staff notes (note_TalentNote) are deliberately KEPT on a reset: they are
    // the staff's own observations about the talent (retard, posture,
    // administratif), not onboarding-derived data, so they outlive an identity
    // re-onboard. They are erased only by anonymizeTalent (true RGPD erasure),
    // mirroring how the single-column predecessor survived a reset.

    // 3. Reset the worker-created Participation rows to their import defaults
    //    (the worker creates them with only talent/event/campus set).
    await tx.participation.updateMany({
      where: { talentId },
      data: {
        isPresent: false,
        delay: 0,
        bringPc: false,
        camperRating: null,
        camperFeedback: null,
      },
    });

    // 4. Reset the Talent row. Keep externalId + email (SF identity / auth key);
    //    re-seed the SF-owned columns from the mirror; null everything onboarding
    //    and the parent flows wrote; zero the cached XP projections.
    await tx.talent.update({
      where: { id: talentId },
      data: {
        ...clearOnboardingTimestamps(),
        ...clearTalentOnboardingArtifacts(),
        nom: sf?.nom ?? talent.nom,
        prenom: sf?.prenom ?? talent.prenom,
        phone: sf?.phone ?? null,
        civilite: sf?.civilite ?? null,
        niveau: sf?.niveau ?? null,
        schoolId: sf?.sfSchoolId ?? null,
        xp: 0,
        eventsCount: 0,
        imageRightsDecision: null,
        imageRightsDecidedAt: null,
        imageRightsSignerPrenom: null,
        imageRightsSignerNom: null,
        imageRightsFilePath: null,
        parentRulesSignedAt: null,
        parentRulesSignerPrenom: null,
        parentRulesSignerNom: null,
        parentRulesRelationship: null,
        parentRulesSignedCity: null,
        highSchoolNameManual: null,
        parentType: null,
        parentCivilite: null,
        parentNom: null,
        parentPrenom: null,
        parentEmail: null,
        parentPhone: null,
        parent2Type: null,
        parent2Civilite: null,
        parent2Nom: null,
        parent2Prenom: null,
        parent2Email: null,
        parent2Phone: null,
        hasLaptop: false,
        setupDescription: null,
        interestsFreeText: null,
        discordId: null,
        badges: Prisma.DbNull,
        lastSyncedAt: null,
        // Activity projections: a fresh-import talent has never logged in, so
        // both the first-login and last-active facts are dropped alongside the
        // account itself (userId null + bauth_user deleted below).
        lastActiveAt: null,
        firstLoginAt: null,
        userId: null,
      },
    });

    // 5. Delete the talent's login identity outright: a freshly-imported talent
    //    has no bauth_user. (userId was just nulled above; the captured value
    //    still points at the row to drop.)
    //
    //    Hard-deleting the bauth_user is safe because a *student* user is only
    //    referenced by rows that fall away with it: bauth_session / bauth_account
    //    (cascade, and cleared just below) and the Talent itself (SetNull, already
    //    nulled). Every other FK onto bauth_user is staff-authored content
    //    (TicketMessage.author, NewsPost, Broadcast, StaffInvitation,
    //    MessageTemplate), so a student holds none and the delete can't trip a
    //    P2003. Note TicketMessage.author has no onDelete, so it would block this
    //    delete the moment a student authored one: revisit here if students ever
    //    gain a staff-side affordance like opening tickets.
    if (talent.userId) {
      await tx.bauth_session.deleteMany({ where: { userId: talent.userId } });
      await tx.bauth_account.deleteMany({ where: { userId: talent.userId } });
      await tx.bauth_user.delete({ where: { id: talent.userId } });
    }

    // 6. Delete parent bauth_user(s) minted during testing, but only ones no
    //    other talent still references, so a real sibling keeps their parent
    //    login. The sibling + role guard lives in findUnreferencedParentAccount
    //    (shared with anonymizeTalent); here we delete rather than scrub since
    //    the goal is "as if never created". The role === 'parent' check inside
    //    the guard also keeps the FK-safety from step 5: it never hard-deletes a
    //    staff user who happens to share the email (and who could hold blocking
    //    ticket/CMS rows).
    for (const email of new Set(parentEmails)) {
      const orphan = await findUnreferencedParentAccount(tx, email, talentId);
      if (orphan) await deleteParentAccountCascade(tx, orphan.id);
    }

    return documentKeys;
  });

  // Post-commit: drop the dereferenced onboarding PDFs from object storage.
  await deleteAnonymizedDocuments(documentKeys);
}
