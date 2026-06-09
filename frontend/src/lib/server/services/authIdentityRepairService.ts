import { prisma } from '$lib/server/db';
import {
  applyRepointAndDrop,
  applyRename,
  applySwap,
  applySever,
} from '$lib/server/authIdentityRepairCore';
import type { AuthRepairAction } from '$lib/domain/authIdentity';

export type { AuthRepairAction } from '$lib/domain/authIdentity';

/**
 * Request-side wrappers around the auth-identity repair core, for the admin UI.
 * Each runs one core operation in a transaction with the prisma singleton and
 * the acting admin's id as `resolvedBy` (recorded in the `AuthIdentityRepair`
 * ledger). The core re-verifies the precondition inside the transaction, so an
 * action that no longer applies (state moved since the page loaded) throws and
 * rolls back — the caller surfaces it as a failed action.
 *
 * The standalone backlog CLI drives the same core directly; this module is only
 * the `$lib`-bound entry point for the page actions.
 */

export async function runAuthRepair(
  action: AuthRepairAction,
  talentId: string,
  resolvedBy: string,
): Promise<void> {
  switch (action) {
    case 'repointDrop':
      await prisma.$transaction((tx) =>
        applyRepointAndDrop(tx, talentId, resolvedBy),
      );
      return;
    case 'rename':
      await prisma.$transaction((tx) => applyRename(tx, talentId, resolvedBy));
      return;
    case 'swap':
      await prisma.$transaction((tx) => applySwap(tx, talentId, resolvedBy));
      return;
    case 'sever':
      await prisma.$transaction((tx) => applySever(tx, talentId, resolvedBy));
      return;
  }
}
