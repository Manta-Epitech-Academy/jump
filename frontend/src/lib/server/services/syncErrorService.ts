/**
 * The only writes to `Sync_Error`: what a Salesforce sync could not do, kept
 * exactly as long as it keeps failing.
 *
 * Nobody resolves a row by hand. The sync records an error when a pass meets
 * it, deletes it when a pass finds it gone, and an `ok` full pass deletes every
 * row it did not meet (`dropErrorsNotSeenSince`). So the queue is the state of
 * the last passes, and an empty one means nothing is wrong. A "resolved" flag
 * used to hide a row that the next pass reopened in silence.
 *
 * Its own file rather than inside `syncService.ts` so the run lifecycle
 * (`syncRunService`) and the Connexion repair can close errors without
 * importing the whole inbound path.
 */

import type { Prisma, Sync_ErrorKind } from '@prisma/client';
import { prisma } from '$lib/server/db';

/** Why a talent's login could not be reconciled with Salesforce's address. */
export type LoginFailure = {
  kind: Exclude<Sync_ErrorKind, 'MISSING_NAME'>;
  /** The technical cause, for a developer: English, never an explanation. */
  detail: string | null;
};

/**
 * A contact Salesforce sent without a first or a last name. Keyed by its
 * Salesforce id, the one half of the contact that is always there.
 */
export async function recordMissingName(contact: {
  externalId: string;
  contactName: string | null;
  email: string | null;
}): Promise<void> {
  const now = new Date();
  const fields = { contactName: contact.contactName, email: contact.email };
  await prisma.sync_Error.upsert({
    where: { externalId: contact.externalId },
    create: {
      kind: 'MISSING_NAME',
      externalId: contact.externalId,
      ...fields,
      firstOccurredAt: now,
      lastOccurredAt: now,
    },
    update: { ...fields, lastOccurredAt: now },
  });
}

/** Forget the nameless-contact errors of contacts that now arrive named. */
export async function clearMissingNames(externalIds: string[]): Promise<void> {
  if (externalIds.length === 0) return;
  await prisma.sync_Error.deleteMany({
    where: { externalId: { in: externalIds } },
  });
}

/**
 * Settle a talent's login error on what this pass found: record the failure,
 * or delete the row when there is none.
 *
 * `current` is the kind already stored (the caller reads it with the talent it
 * loads anyway), so a pass where nothing was wrong and nothing was stored
 * costs no query. A talent holds at most one login error, its latest cause: a
 * cause that changes restarts `firstOccurredAt`, because "depuis quand" is
 * asked about the problem the admin is reading, not about an earlier one.
 */
export async function settleLoginError(
  talentId: string,
  current: Sync_ErrorKind | null,
  failure: LoginFailure | null,
): Promise<void> {
  if (!failure) {
    if (current) await prisma.sync_Error.deleteMany({ where: { talentId } });
    return;
  }
  const now = new Date();
  const update: Prisma.Sync_ErrorUpdateInput =
    current === failure.kind
      ? { detail: failure.detail, lastOccurredAt: now }
      : {
          kind: failure.kind,
          detail: failure.detail,
          firstOccurredAt: now,
          lastOccurredAt: now,
        };
  await prisma.sync_Error.upsert({
    where: { talentId },
    create: {
      kind: failure.kind,
      talentId,
      detail: failure.detail,
      firstOccurredAt: now,
      lastOccurredAt: now,
    },
    update,
  });
}

/**
 * Delete the login errors of the talents a repair just put back on their
 * Salesforce address, in the repair's own transaction, so the queue does not
 * keep them until the next pass.
 */
export async function clearLoginErrors(
  tx: Prisma.TransactionClient,
  talentIds: string[],
): Promise<void> {
  if (talentIds.length === 0) return;
  await tx.sync_Error.deleteMany({ where: { talentId: { in: talentIds } } });
}

/**
 * Forget the errors a successful full pass did not meet.
 *
 * A full pass pushes every talent of the perimeter, so an error still true is
 * stamped during the run. One older than the run's start concerns a talent the
 * pass no longer carries, or a problem that is gone. Only on `ok`: a run that
 * failed part-way did not reach every talent.
 */
export async function dropErrorsNotSeenSince(
  runStartedAt: Date,
): Promise<void> {
  await prisma.sync_Error.deleteMany({
    where: { lastOccurredAt: { lt: runStartedAt } },
  });
}
