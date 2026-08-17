/**
 * Admin remediation of Salesforce sync errors: marking rows resolved, and
 * rebinding a talent whose Salesforce extId was regenerated.
 *
 * Deliberately its own file rather than folded into `syncService.ts`: that one is
 * the inbound worker path (what Salesforce claims), this one is what a human
 * decides afterwards about a row the sync could not settle.
 */

import { prisma } from '$lib/server/db';
import type { ServiceResult } from './result';

/** Mark one error row resolved. */
export async function resolveSyncError(id: string): Promise<void> {
  await prisma.syncError.update({
    where: { id },
    data: { resolved: true, resolvedAt: new Date() },
  });
}

/** Mark every unresolved row resolved (offered only on the unfiltered view). */
export async function resolveAllSyncErrors(): Promise<{ count: number }> {
  const { count } = await prisma.syncError.updateMany({
    where: { resolved: false },
    data: { resolved: true, resolvedAt: new Date() },
  });
  return { count };
}

/**
 * Resolve a specific set of rows — the page passes the currently-filtered
 * unresolved ids, so an admin can clear "all Coding Club errors" without the
 * DB-wide `resolveAllSyncErrors`. Scoped to `resolved: false` so a stale id
 * can't un-resolve a row.
 */
export async function resolveSyncErrors(
  ids: string[],
): Promise<{ count: number }> {
  const { count } = await prisma.syncError.updateMany({
    where: { id: { in: ids }, resolved: false },
    data: { resolved: true, resolvedAt: new Date() },
  });
  return { count };
}

export type RebindFailure = 'not_found' | 'no_existing_ext_id' | 'ext_id_taken';

/**
 * Rebind a talent's externalId from the dead one (`existingExtId`) to the one
 * Salesforce is now sending (`attemptedExtId`), then mark the row resolved.
 * Used for the "Salesforce regenerated the extId" case — the same human, new
 * identifier, our DB needs to catch up.
 *
 * Safety:
 *   - Row must carry an `existingExtId` (the lookup that surfaced the conflict
 *     must have found the prior talent). Otherwise we have nothing to migrate.
 *   - If the prior talent no longer exists (someone already rebound it), just
 *     resolve the row idempotently.
 *   - If the target `attemptedExtId` is already taken by *another* talent in
 *     our DB, refuse — that's a different conflict the admin needs to inspect
 *     manually.
 */
export async function rebindTalentExtId(
  syncErrorId: string,
): Promise<ServiceResult<RebindFailure>> {
  const row = await prisma.syncError.findUnique({ where: { id: syncErrorId } });
  if (!row) return { ok: false, reason: 'not_found' };
  if (!row.existingExtId) return { ok: false, reason: 'no_existing_ext_id' };

  const existing = await prisma.talent.findUnique({
    where: { externalId: row.existingExtId },
    select: { id: true },
  });
  if (!existing) {
    // Prior talent gone (manual delete or already rebound) — clean up the row
    // instead of failing.
    await resolveSyncError(syncErrorId);
    return { ok: true };
  }

  const clash = await prisma.talent.findUnique({
    where: { externalId: row.attemptedExtId },
    select: { id: true },
  });
  if (clash && clash.id !== existing.id) {
    return { ok: false, reason: 'ext_id_taken' };
  }

  await prisma.$transaction([
    prisma.talent.update({
      where: { id: existing.id },
      data: { externalId: row.attemptedExtId },
    }),
    prisma.syncError.update({
      where: { id: syncErrorId },
      data: { resolved: true, resolvedAt: new Date() },
    }),
  ]);

  return { ok: true };
}
