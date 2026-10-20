import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  changeUserEmail,
  EmailChangeConflict,
} from '$lib/server/services/userEmail';
import {
  clearLegacyDocumentKeys,
  deleteDocumentObjects,
  documentKeysOf,
  TALENT_DOCUMENT_KEYS_SELECT,
} from '$lib/server/services/onboardingDocuments';
import {
  findUnreferencedParentAccount,
  deleteParentAccountCascade,
} from '$lib/server/services/parentAccount';
import {
  clearGuardianActs,
  clearOnboardingTimestamps,
  clearTalentOnboardingArtifacts,
} from '$lib/domain/talentOnboarding';
import { clearGuardianContacts, guardianEmailsOf } from '$lib/domain/contact';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { upsertSchoolingYearRecord } from '$lib/server/services/schoolingService';

/**
 * Why `ensureTalentUser` could not give a talent a login: no Salesforce address
 * to create one from, or an address that is already somebody else's (a parent,
 * a staff member, another talent). The message is the French sentence the sync
 * writes into its `SyncError`; `kind` is what a caller branches on.
 */
export class TalentAccountError extends Error {
  constructor(
    readonly kind: 'no_email' | 'identity_conflict',
    message: string,
  ) {
    super(message);
    this.name = 'TalentAccountError';
  }
}

/**
 * Ensure a talent has a linked `bauth_user` and return its id.
 *
 * Seeded / Salesforce-imported talents exist as `Talent` rows long before they
 * ever sign in, so they carry no `bauth_user`. Every flow that needs a real
 * auth identity for them (OTP login, fastlogin links, admin impersonation)
 * has to bootstrap that user first. This is the single place that does it:
 * reuse an existing `bauth_user` with the same email if one is around (e.g.
 * created by a sibling flow), otherwise create one, then link it back.
 *
 * Throws a {@link TalentAccountError} when the talent has neither a linked
 * user nor an email (BetterAuth has no identifier to hang a sign-in identity
 * off), or when the email already belongs to a parent, a staff member or
 * another talent.
 */
export async function ensureTalentUser(talentId: string): Promise<string> {
  const talent = await prisma.talent.findUniqueOrThrow({
    where: { id: talentId },
    select: {
      id: true,
      userId: true,
      sfImport: { select: { sfEmail: true } },
      prenom: true,
      nom: true,
    },
  });

  // Already linked: realign the login email through the single write path, then
  // return. Salesforce can change its claimed email (`TalentSfImport.sfEmail`)
  // after the link was made; the linked bauth_user.email then goes stale and
  // the student logs in "into the void" (BetterAuth resolves OTP by
  // bauth_user.email). `changeUserEmail`
  // renames it, guarding against a parent/staff address and surfacing a
  // collision (an orphan the student made, or an SF inversion). In either
  // conflict case we leave the link as-is for the admin auth-conflicts tool and
  // still return the current id so a login is never blocked.
  if (talent.userId) {
    const wanted = talent.sfImport?.sfEmail?.toLowerCase().trim();
    if (wanted) {
      try {
        await changeUserEmail(talent.userId, wanted);
      } catch (err) {
        if (!(err instanceof EmailChangeConflict)) throw err;
      }
    }
    return talent.userId;
  }

  const email = talent.sfImport?.sfEmail?.toLowerCase().trim();
  if (!email) {
    throw new TalentAccountError(
      'no_email',
      "Le talent n'a pas d'adresse email SF : impossible de créer un compte de connexion.",
    );
  }

  const existing = await prisma.bauth_user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      staffProfile: { select: { id: true } },
      talent: { select: { externalId: true } },
    },
  });
  let userId: string;
  if (existing) {
    // Never adopt a parent or staff account as a student's login: that would
    // hand this talent's dashboard to whoever owns that email. An SF data
    // anomaly (a student carrying a parent/staff email) must be resolved by
    // hand, not papered over by silently linking.
    if (existing.staffProfile || existing.role === 'parent') {
      throw new TalentAccountError(
        'identity_conflict',
        "L'adresse du talent correspond à un compte parent ou staff : résolution manuelle requise (conflit d'identité).",
      );
    }
    // Nor an account already linked to another talent: two SF records sharing
    // one email (a Salesforce duplicate). The link below would trip
    // `Talent.userId`'s unique constraint anyway; surface the real conflict
    // instead of a raw P2002 so the sync error names the holder and an admin
    // can resolve it.
    if (existing.talent) {
      throw new TalentAccountError(
        'identity_conflict',
        `L'adresse du talent est déjà utilisée par le talent externalId="${existing.talent.externalId}" : résolution manuelle requise (conflit d'identité).`,
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
      // tripped. The winner's row exists now: adopt it instead of failing.
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
 * A reset to import asked for a talent the RGPD erasure has already
 * anonymised. There is no import to return to (the erasure deleted the
 * Salesforce mirror), and resetting would re-create a schooling row and wipe
 * what the erasure deliberately kept.
 */
export class TalentAlreadyErased extends Error {
  constructor() {
    super(
      'Ce talent a été anonymisé (RGPD) : il ne peut plus être réinitialisé.',
    );
    this.name = 'TalentAlreadyErased';
  }
}

/**
 * Factory reset: bring a talent all the way back to the state the Salesforce
 * worker leaves them in on first import, and nothing more. The admin affordance
 * for cleaning up after testing the talent experience in prod (impersonate →
 * play minigames, onboard, upload, sign → wipe it all).
 *
 * What the worker import establishes, and what this keeps:
 *   - the `Talent` row's SF identity (`externalId`) and the columns the
 *     worker seeds from Salesforce (`nom`, `prenom`, `phone`, `civilite`,
 *     `niveau`, `schoolId`), re-seeded here from the `TalentSfImport` mirror,
 *     which is exactly what the worker would seed on a fresh create, so an
 *     onboarding edit to e.g. the phone is rolled back to SF's claim;
 *   - the SF mirror itself (`TalentSfImport`, worker-owned);
 *   - the `Participation` rows the worker upserts per event (the talent *was*
 *     imported into those events), kept as the worker wrote them.
 *
 * Everything else a talent accrues after import is deleted: the XP ledger and
 * its cached projections (`xp`/`eventsCount` → 0), the émargement marks
 * (`EventPresence`, the source `eventsCount` projects from, so the zeroed
 * count stays consistent and a later presence write can't resurrect it),
 * minigame attempts, the CTFd activity mirrors, closings
 * (and the audit trail of any admin reset), interests, PDF jobs,
 * broadcast-recipient rows, every
 * onboarding/parent/image-rights/règlement column, and the generated onboarding
 * PDFs in object storage. The login *history* goes too: sessions and any linked
 * OAuth/credential accounts are cleared so the talent is back to
 * never-having-logged-in. The `bauth_user` identity itself is kept, though:
 * eager mint gives every fresh SF import a login account from day one, so
 * reproducing import state means keeping it, not deleting it (dropping it would
 * lock the talent out of OTP login, which routes by `bauth_user`). Any parent
 * account minted during testing that no *other* talent still references is
 * deleted (step 4).
 *
 * Contrast with `anonymizeTalent`: it scrubs identity to placeholders for RGPD
 * erasure but deliberately keeps the XP/stats and the account; this keeps the
 * identity and deliberately destroys the stats. What each of the two does to
 * every table and every `Talent` column is classified, with the reason, in
 * `talentScopedData.integration.test.ts`.
 *
 * Refuses a talent the erasure has anonymised ({@link TalentAlreadyErased}),
 * before writing anything.
 *
 * S3 deletes run after the transaction commits (an external call inside the tx
 * would risk the interactive-tx timeout rolling back the DB reset), mirroring
 * `anonymizeTalent` → {@link deleteDocumentObjects}.
 */
export async function resetTalentToImport(talentId: string): Promise<void> {
  const documentKeys = await prisma.$transaction(async (tx) => {
    const talent = await tx.talent.findUnique({
      where: { id: talentId },
      select: {
        nom: true,
        prenom: true,
        userId: true,
        anonymizedAt: true,
        parentEmail: true,
        parent2Email: true,
        // Every key the onboarding PDFs may sit under: step 1 deletes the
        // dossier rows that hold them, so one missed here is a PDF left in the
        // bucket that nothing references and no later reset can find.
        ...TALENT_DOCUMENT_KEYS_SELECT,
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
    if (talent.anonymizedAt) throw new TalentAlreadyErased();

    const sf = talent.sfImport;

    // Captured before the update nulls them, so the matching parent accounts can
    // be cleaned up afterwards (step 4) and the PDF objects deleted post-commit.
    const parentEmails = guardianEmailsOf(talent);
    const documentKeys = documentKeysOf(talent);

    // 1. Delete every talent-scoped record created after import.
    //    Broadcast recipients are matched on both the talent and parent-of
    //    slots (SetNull relations, so deleted explicitly rather than left
    //    orphaned).
    // Answers and their option rows cascade from the record.
    await tx.closing_Record.deleteMany({ where: { talentId } });
    // The reset-audit trail is talent-scoped too (talentId + a free-text reason);
    // it must go with the closings it traces, matching anonymizeTalent.
    await tx.closing_ResetEvent.deleteMany({ where: { talentId } });
    await tx.talentInterest.deleteMany({ where: { talentId } });
    // Every year's dossier, not just the current one. Unlike
    // schooling_YearRecord (kept below - which lycée a talent attended is a fact
    // about them, independent of Jump's sign-up), the dossier IS the sign-up, and
    // voiding it is the whole point of a reset to import. Leaving the current
    // year's row behind would also un-reset the talent on their next step: the
    // service copies the whole dossier back onto the projection.
    await tx.onboarding_Record.deleteMany({ where: { talentId } });
    await tx.onboardingPdfJob.deleteMany({ where: { talentId } });
    await tx.minigameAttempt.deleteMany({ where: { talentId } });
    // The CTFd activities, beside the minigame attempts and for the same reason:
    // both mirror what the talent did on another platform, and both carry the
    // state of a float. Leaving this one behind is not a stale row, it silences
    // what the talent earns next: `xpCelebrated` survives the `xpGrant` delete
    // below, so XP re-earned from zero stay below the mark of a celebration
    // shown before the reset, and no float fires until they pass it. The progress
    // and the `budgetMinutes` snapshot outlive the reset too, so the mission
    // line still reads "6 / 15 étapes validées" for a talent returned to import.
    // What is NOT reset is CTFd's own account: a later solve reports progress
    // again, re-opens a participation through the entry action and re-grants,
    // which is the mirror behaving as one.
    await tx.workshop_Participation.deleteMany({ where: { talentId } });
    await tx.xpGrant.deleteMany({ where: { talentId } });
    await tx.eventPresence.deleteMany({ where: { talentId } });
    await tx.imageRightsDecisionRecord.deleteMany({ where: { talentId } });
    await tx.broadcastRecipient.deleteMany({
      where: { OR: [{ talentId }, { parentOfTalentId: talentId }] },
    });
    // Deletion requests are deliberately KEPT: a pending one is a legal request
    // that still has to be answered, and a fulfilled one is the proof of an
    // erasure. Neither is something the talent accrued in the app.
    // Bilan feedback the talent submitted after onboarding (answers + their
    // selected options cascade). Talent-created Jump data, so it goes on a reset
    // to import. Scoped to this talent's own rows only: unlike anonymizeTalent
    // (true RGPD erasure), a re-onboard does not chase unreconciled public bilan
    // rows by e-mail - those aren't this talent's onboarding data to reset.
    await tx.feedback_Submission.deleteMany({ where: { talentId } });
    // Staff notes (note_TalentNote) are deliberately KEPT on a reset: they are
    // the staff's own observations about the talent (retard, posture,
    // administratif), not onboarding-derived data, so they outlive an identity
    // re-onboard. They are erased only by anonymizeTalent (true RGPD erasure),
    // mirroring how the single-column predecessor survived a reset.

    // 2. Reset the Talent row. Keep externalId (the SF identity; the login
    //    email lives on the linked bauth_user, kept in step 3);
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
        xp: 0,
        eventsCount: 0,
        ...clearGuardianActs(),
        // The two legacy PDF keys, collected above and deleted post-commit.
        ...clearLegacyDocumentKeys(),
        ...clearGuardianContacts(),
        highSchoolNameManual: null,
        setupDescription: null,
        interestsFreeText: null,
        // Activity projections: a fresh-import talent has never logged in, so
        // both the first-login and last-active facts are dropped. The login
        // identity itself is kept (step 3 clears only its history), so `userId`
        // stays linked.
        lastActiveAt: null,
        firstLoginAt: null,
      },
    });

    // niveau/schoolId are the cached projection of Schooling_YearRecord
    // (schoolingService), not written on Talent directly here - otherwise the
    // current year's ledger row goes stale the moment a reset diverges from what
    // sync last wrote there.
    //
    // Only the *current* year is realigned to the mirror. Earlier years are
    // deliberately KEPT, like the worker-created Participation rows themselves
    // and for the same reason: they are import-derived schooling history, not
    // onboarding output, and a re-onboard is not an erasure. anonymizeTalent is
    // the path that drops every year (see its step 2).
    await upsertSchoolingYearRecord(tx, {
      talentId,
      schoolYear: schoolYearOf(new Date(), 'Europe/Paris').label,
      niveau: sf?.niveau ?? null,
      schoolId: sf?.sfSchoolId ?? null,
      source: 'staff',
    });

    // 3. Clear the login *history* but keep the identity. Eager mint gives every
    //    fresh Salesforce import a bauth_user from day one (see syncService), so
    //    the state "the worker leaves them in on first import" now includes a
    //    login account: reset restores that state, it does not delete it.
    //    Dropping the account would leave the talent unable to request an OTP
    //    (login routes by bauth_user) until an admin re-impersonated them. So we
    //    wipe only the sessions and any linked OAuth/credential accounts, the
    //    never-logged-in state, and keep the bauth_user linked (userId is left
    //    intact above). Its email already tracks the SF address through the
    //    sync's identity reconcile, so there is nothing to realign here.
    if (talent.userId) {
      await tx.bauth_session.deleteMany({ where: { userId: talent.userId } });
      await tx.bauth_account.deleteMany({ where: { userId: talent.userId } });
    }

    // 4. Delete parent bauth_user(s) minted during testing, but only ones no
    //    other talent still references, so a real sibling keeps their parent
    //    login. The sibling + role guard lives in findUnreferencedParentAccount
    //    (shared with anonymizeTalent); here we delete rather than scrub since
    //    the goal is "as if never created". The role === 'parent' check inside
    //    the guard keeps this delete FK-safe: it never hard-deletes a staff user
    //    who happens to share the email (and who could hold blocking CMS rows).
    for (const email of parentEmails) {
      const orphan = await findUnreferencedParentAccount(tx, email, talentId);
      if (orphan) await deleteParentAccountCascade(tx, orphan.id);
    }

    return documentKeys;
  });

  // Post-commit: drop the dereferenced onboarding PDFs from object storage.
  await deleteDocumentObjects(documentKeys);
}
