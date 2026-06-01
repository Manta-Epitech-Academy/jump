import type { TalentDeletionRequest } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  anonymizeTalent,
  deleteAnonymizedDocuments,
} from '$lib/server/services/anonymizationService';
import { sendActionEmail } from '$lib/server/email/actionMail';

/**
 * Account deletion as a request workflow rather than an instant wipe.
 *
 * A talent asking to delete their account opens a `pending`
 * `TalentDeletionRequest`; their account keeps working untouched until staff
 * act on it. Staff *fulfil* it (which runs `anonymizeTalent` — the real GDPR
 * erasure) or *reject* it; the talent can *withdraw* their own pending request.
 * Every transition is a status on the one row, so it stands as the audit trail.
 *
 * Why not delete on the spot: a stage de seconde cohort depends on these
 * accounts, and GDPR gives the controller up to a month to honour an erasure
 * request — there is no obligation to destroy data the instant a button is
 * clicked. Deferring to staff protects the pipeline without breaching the law.
 */

// GDPR: an erasure request must be honoured within one month. Past this many
// days a pending request is "overdue" and the admin queue flags it red.
export const DELETION_OVERDUE_DAYS = 21;

export function isDeletionRequestOverdue(
  requestedAt: Date,
  now: Date = new Date(),
): boolean {
  const ageDays = (now.getTime() - requestedAt.getTime()) / 86_400_000;
  return ageDays >= DELETION_OVERDUE_DAYS;
}

/** The talent's current open request, if any — drives the settings UI state. */
export function getPendingDeletionRequest(
  talentId: string,
): Promise<TalentDeletionRequest | null> {
  return prisma.talentDeletionRequest.findFirst({
    where: { talentId, status: 'pending' },
    orderBy: { requestedAt: 'desc' },
  });
}

/**
 * The talent's most recent request whatever its status — lets the settings page
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
 * safe against a double-submit — only a still-`pending` row is processed.
 *
 * @returns true if it was fulfilled, false if the request was already resolved.
 */
export async function fulfillTalentDeletion(
  requestId: string,
  adminUserId: string,
): Promise<boolean> {
  // Capture the talent's contact details inside the transaction, *before*
  // anonymisation scrubs them — this is the last moment we can reach them.
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.talentDeletionRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: {
        status: 'fulfilled',
        resolvedAt: new Date(),
        resolvedBy: adminUserId,
      },
    });
    if (claimed.count === 0) return null;

    const request = await tx.talentDeletionRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        talentId: true,
        talent: { select: { email: true, prenom: true } },
      },
    });
    const documentKeys = await anonymizeTalent(tx, request.talentId);
    return { contact: request.talent, documentKeys };
  });

  if (!result) return false;

  // Out-of-band, after the transaction commits — never run external calls
  // inside a DB transaction. Both are best-effort: the account is already
  // erased, so neither a storage nor a mail failure may undo it (one logs, the
  // other returns rather than throwing).
  await deleteAnonymizedDocuments(result.documentKeys);
  if (result.contact.email) {
    await sendActionEmail('account_deletion_done', result.contact.email, {
      prenom: result.contact.prenom,
    });
  }
  return true;
}

/**
 * Staff reject a pending request (e.g. account needed for an ongoing event).
 * The talent is free to ask again later — a fresh request is a new row.
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

  // Inform the talent "without delay" (RGPD art. 12(4)) — the in-app notice
  // alone only reaches them if they happen to log back in. Best-effort send.
  const request = await prisma.talentDeletionRequest.findUnique({
    where: { id: requestId },
    select: { talent: { select: { email: true, prenom: true } } },
  });
  if (request?.talent.email) {
    await sendActionEmail('account_deletion_refused', request.talent.email, {
      prenom: request.talent.prenom,
      deletion_reason: reason ?? '',
    });
  }
  return true;
}
