import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  applyRepointAndDrop,
  applySwap,
  applySever,
  planRepointAndDrop,
} from '$lib/server/authIdentityRepairCore';
import type { AuthRepairAction } from '$lib/domain/authIdentity';
import { clearLoginErrors } from '$lib/server/services/syncErrorService';

export type { AuthRepairAction } from '$lib/domain/authIdentity';

/**
 * Request-side wrappers around the auth-identity repair core, for the admin UI.
 * Each runs one core operation in a transaction with the prisma singleton and
 * the acting admin's id as `resolvedBy` (recorded in the `AuthIdentityRepair`
 * ledger). The core re-verifies the precondition inside the transaction, so an
 * action that no longer applies (state moved since the page loaded) throws and
 * rolls back: the caller surfaces it as a failed action.
 *
 * This module is the `$lib`-bound entry point for the page actions; the
 * Salesforce sync drives the same core through `autoResolveAuthIdentity` below.
 */

export async function runAuthRepair(
  action: AuthRepairAction,
  talentId: string,
  resolvedBy: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const realigned = await applyRepair(tx, action, talentId, resolvedBy);
    // The repair is what those talents' login errors were waiting for: close
    // them with it rather than at the next pass.
    await clearLoginErrors(tx, realigned);
  });
}

/** Apply one repair, and return the talents whose login it put back on their
 * Salesforce address. */
async function applyRepair(
  tx: Prisma.TransactionClient,
  action: AuthRepairAction,
  talentId: string,
  resolvedBy: string,
): Promise<string[]> {
  switch (action) {
    case 'repointDrop':
      await applyRepointAndDrop(tx, talentId, resolvedBy);
      return [talentId];
    case 'swap': {
      const plan = await applySwap(tx, talentId, resolvedBy);
      return [plan.aTalentId, plan.bTalentId];
    }
    case 'sever':
      // Stops an exposure and nothing more: the talent is left without a
      // login, so the cause of its error still holds and the next pass that
      // carries it says so.
      await applySever(tx, talentId, resolvedBy);
      return [];
  }
}

export type AutoResolveOutcome = 'repoint_drop' | 'skipped';

/**
 * Apply, on its own, the ONE provably-safe resolution for a talent's auth
 * divergence: ORPHAN_HOLDER → repoint the talent onto the orphan account + drop
 * the stale one. Used by the Salesforce sync (on a `changeUserEmail` collision)
 * to self-heal that case each pass.
 *
 * The simple no-collision case ("nobody holds the SF email") needs no repair:
 * `changeUserEmail` renames the account directly, so it never reaches here.
 * Everything else (swap/inversion, parent/staff holders, exposures) returns
 * `'skipped'` and stays a conflict for an admin: an inversion originates from
 * Salesforce being wrong, so auto-swapping login identities on its say-so risks
 * thrashing and cross-account exposure between minors.
 *
 * The verdict is probed read-only first (`planRepointAndDrop` throws when its
 * precondition fails), then applied in its own transaction, which re-verifies
 * inside, so a race between probe and apply can't act on stale state (it rolls
 * back and the next sync retries).
 */
export async function autoResolveAuthIdentity(
  talentId: string,
  resolvedBy: string,
): Promise<AutoResolveOutcome> {
  try {
    await planRepointAndDrop(prisma, talentId);
  } catch {
    return 'skipped';
  }
  await prisma.$transaction((tx) =>
    applyRepointAndDrop(tx, talentId, resolvedBy),
  );
  return 'repoint_drop';
}
