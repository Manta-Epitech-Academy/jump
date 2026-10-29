import type { TalentDeletionRequest } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { anonymizeTalent } from '$lib/server/services/anonymizationService';
import { deleteDocumentObjects } from '$lib/server/services/onboardingDocuments';
import { sendActionEmail } from '$lib/server/email/actionMail';

/**
 * Account deletion as a request workflow rather than an instant wipe.
 *
 * A talent asking to delete their account opens a `pending`
 * `TalentDeletionRequest`; their account keeps working untouched until staff
 * act on it. Staff *fulfil* it (which runs `anonymizeTalent`, the real GDPR
 * erasure) or *reject* it; the talent can *withdraw* their own pending request.
 * Every transition is a status on the one row, so it stands as the audit trail.
 *
 * Why not delete on the spot: a stage de seconde cohort depends on these
 * accounts, and GDPR gives the controller up to a month to honour an erasure
 * request: there is no obligation to destroy data the instant a button is
 * clicked. Deferring to staff protects the pipeline without breaching the law.
 */

// GDPR: an erasure request must be honoured within one month. Past this many
// days a pending request is "overdue" and the admin queue flags it red.
const DELETION_OVERDUE_DAYS = 21;

export function isDeletionRequestOverdue(
  requestedAt: Date,
  now: Date = new Date(),
): boolean {
  const ageDays = (now.getTime() - requestedAt.getTime()) / 86_400_000;
  return ageDays >= DELETION_OVERDUE_DAYS;
}

/** The talent's current open request, if any: drives the settings UI state. */
function getPendingDeletionRequest(
  talentId: string,
): Promise<TalentDeletionRequest | null> {
  return prisma.talentDeletionRequest.findFirst({
    where: { talentId, status: 'pending' },
    orderBy: { requestedAt: 'desc' },
  });
}

/**
 * The talent's most recent request whatever its status: lets the settings page
 * tell apart "request pending" from "request was refused" (which the talent is
 * owed an explanation for) without leaking older, superseded history.
 */
export function getLatestDeletionRequest(
  talentId: string,
): Promise<TalentDeletionRequest | null> {
  return prisma.talentDeletionRequest.findFirst({
    where: { talentId },
    orderBy: { requestedAt: 'desc' },
  });
}

/** Talent dismisses the "your request was refused" notice in their settings. */
export async function acknowledgeDeletionRejection(
  talentId: string,
): Promise<void> {
  await prisma.talentDeletionRequest.updateMany({
    where: { talentId, status: 'rejected', acknowledgedAt: null },
    data: { acknowledgedAt: new Date() },
  });
}

/**
 * Open a deletion request for a talent. Idempotent: if one is already pending
 * we return it untouched rather than stacking duplicate rows (so a double-click
 * or a re-submit can't spawn two requests for the same person).
 */
export async function requestTalentDeletion(
  talentId: string,
  reason?: string | null,
): Promise<TalentDeletionRequest> {
  const existing = await getPendingDeletionRequest(talentId);
  if (existing) return existing;

  return prisma.talentDeletionRequest.create({
    data: { talentId, reason: reason?.trim() || null },
  });
}

/**
 * Talent withdraws their own pending request. Marked `cancelled` (self-service,
 * so `resolvedBy` stays null) instead of deleted, to keep the lifecycle on
 * record. No-op if nothing is pending.
 */
export async function cancelTalentDeletion(talentId: string): Promise<void> {
  await prisma.talentDeletionRequest.updateMany({
    where: { talentId, status: 'pending' },
    data: { status: 'cancelled', resolvedAt: new Date() },
  });
}

/**
 * Staff fulfil a pending request: erase the talent (anonymisation) and flip the
 * request to `fulfilled` in the same transaction. The status guard makes it
 * safe against a double-submit: only a still-`pending` row is processed.
 *
 * The talent's Salesforce id is recorded as erased in that same transaction
 * (`Sync_ErasedContact`), because the erasure nulls it on the talent and the
 * sync would otherwise import the contact again at its next push. Only here:
 * the inactivity sweep erases without barring, see the model.
 *
 * @returns true if it was fulfilled, false if the request was already resolved.
 */
export async function fulfillTalentDeletion(
  requestId: string,
  adminUserId: string,
): Promise<boolean> {
  // Capture the talent's contact details inside the transaction, *before*
  // anonymisation scrubs them: this is the last moment we can reach them.
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.talentDeletionRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: {
        status: 'fulfilled',
        resolvedAt: new Date(),
        resolvedBy: adminUserId,
        reason: null,
        resolutionNote: null,
      },
    });
    if (claimed.count === 0) return null;

    const request = await tx.talentDeletionRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        talentId: true,
        talent: {
          select: {
            prenom: true,
            externalId: true,
            user: { select: { email: true } },
          },
        },
      },
    });
    const { externalId } = request.talent;
    if (externalId) {
      await tx.sync_ErasedContact.upsert({
        where: { externalId },
        create: { externalId },
        // Erased again after a readmission: barred again.
        update: { readmittedAt: null, readmittedBy: null },
      });
    }
    const documentKeys = await anonymizeTalent(tx, request.talentId);
    return { contact: request.talent, documentKeys };
  });

  if (!result) return false;

  // Out-of-band, after the transaction commits: never run external calls
  // inside a DB transaction. Both are best-effort: the account is already
  // erased, so neither a storage nor a mail failure may undo it (one logs, the
  // other returns rather than throwing).
  await deleteDocumentObjects(result.documentKeys);
  if (result.contact.user?.email) {
    await sendActionEmail('account_deletion_done', result.contact.user.email, {
      prenom: result.contact.prenom,
    });
  }
  return true;
}

/**
 * Let a Salesforce contact erased at their request be imported again, when the
 * person asks to come back. The next push that carries the contact creates a
 * new talent from scratch: the erased one stays anonymised, since nothing ties
 * it to the contact any more. The bar is stamped rather than deleted, so the
 * row keeps who lifted it and when.
 *
 * Takes the id somebody copies out of Salesforce, because Jump keeps no way to
 * find an erased person by name (`Sync_ErasedContact` says why).
 *
 * @returns false if the id is not barred, never was or already readmitted, so
 * a mistyped one is told apart from a readmission.
 */
export async function readmitSalesforceContact(
  externalId: string,
  adminUserId: string,
): Promise<boolean> {
  const { count } = await prisma.sync_ErasedContact.updateMany({
    where: { externalId, readmittedAt: null },
    data: { readmittedAt: new Date(), readmittedBy: adminUserId },
  });
  return count > 0;
}

/**
 * Staff reject a pending request (e.g. account needed for an ongoing event).
 * The talent is free to ask again later: a fresh request is a new row.
 *
 * @returns true if it was rejected, false if already resolved.
 */
export async function rejectTalentDeletion(
  requestId: string,
  adminUserId: string,
  note?: string | null,
): Promise<boolean> {
  const reason = note?.trim() || null;
  const { count } = await prisma.talentDeletionRequest.updateMany({
    where: { id: requestId, status: 'pending' },
    data: {
      status: 'rejected',
      resolvedAt: new Date(),
      resolvedBy: adminUserId,
      resolutionNote: reason,
    },
  });
  if (count === 0) return false;

  // Inform the talent "without delay" (RGPD art. 12(4)): the in-app notice
  // alone only reaches them if they happen to log back in. Best-effort send.
  const request = await prisma.talentDeletionRequest.findUnique({
    where: { id: requestId },
    select: {
      talent: { select: { prenom: true, user: { select: { email: true } } } },
    },
  });
  if (request?.talent.user?.email) {
    await sendActionEmail(
      'account_deletion_refused',
      request.talent.user.email,
      {
        prenom: request.talent.prenom,
        deletion_reason: reason ?? '',
      },
    );
  }
  return true;
}
