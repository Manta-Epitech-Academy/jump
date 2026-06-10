import { prisma } from '$lib/server/db';
import {
  applyRepointAndDrop,
  applyRename,
  applySwap,
  applySever,
  planRepointAndDrop,
  planRename,
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

export type AutoResolveOutcome = 'repoint_drop' | 'rename' | 'skipped';

/**
 * Apply, on its own, ONLY the provably-safe resolutions for a talent's auth
 * divergence. Used by the Salesforce sync to self-heal divergences each pass:
 *
 *   - ORPHAN_HOLDER → repoint the talent onto the orphan + drop the stale acct;
 *   - SIMPLE_DRIFT  → rename the linked account to the new email.
 *
 * Everything else returns `'skipped'` and is left untouched as a conflict for an
 * admin to arbitrate. In particular it DELIBERATELY never auto-applies a swap:
 * an inversion originates from Salesforce being wrong, so auto-swapping login
 * identities on its say-so risks thrashing and cross-account exposure between
 * minors. Parent/staff holders and exposures are likewise never forced.
 *
 * The verdict is probed read-only first (the `plan*` calls throw when their
 * precondition fails), then the chosen op is applied in its own transaction,
 * which re-verifies inside — so a race between probe and apply can't act on
 * stale state (it rolls back and the next sync retries).
 */
export async function autoResolveAuthIdentity(
  talentId: string,
  resolvedBy: string,
): Promise<AutoResolveOutcome> {
  let op: 'repoint' | 'rename' | null = null;
  try {
    await planRepointAndDrop(prisma, talentId);
    op = 'repoint';
  } catch {
    try {
      await planRename(prisma, talentId);
      op = 'rename';
    } catch {
      op = null;
    }
  }

  if (op === 'repoint') {
    await prisma.$transaction((tx) =>
      applyRepointAndDrop(tx, talentId, resolvedBy),
    );
    return 'repoint_drop';
  }
  if (op === 'rename') {
    await prisma.$transaction((tx) => applyRename(tx, talentId, resolvedBy));
    return 'rename';
  }
  return 'skipped';
}
