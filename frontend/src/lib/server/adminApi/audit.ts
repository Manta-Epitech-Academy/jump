/**
 * The call log behind the curated admin API.
 *
 * The seminar's rule: audit replaces up-front restriction. We do not pre-approve
 * questions, we record every one that gets asked (refusals included), which both
 * makes misuse visible after the fact and turns the log into free product
 * research about what the team actually needs.
 *
 * `AdminApi_Call` rows are facts, never updated. Nothing projects off them except
 * the per-token quota, which is a live count rather than a stored counter.
 */

import { prisma } from '$lib/server/db';
import type { Prisma } from '@prisma/client';

/**
 * The validated params of a curated operation, as they go into the `params`
 * column: a flat, JSON-safe map by construction, since the catalogue declares
 * only scalar filters (ids, names, school years) and the operation's strict
 * schema has already rejected anything else.
 */
export type AdminApiCallParams = Record<string, unknown>;

/**
 * Who made a call. `tokenId` is null for a browser call (an admin session
 * hitting the same operation), and `actorUserId` falls back to `ANONYMOUS_ACTOR`
 * when a bearer was rejected before any identity could be resolved - a rejected
 * call is exactly the kind we want in the log.
 */
export type AdminApiCaller = {
  actorUserId: string;
  tokenId: string | null;
};

/** Sentinel actor for a call refused before identification (cf. `AuthIdentityRepair.resolvedBy = 'sync'`). */
export const ANONYMOUS_ACTOR = 'anonymous';

export async function recordAdminApiCall(input: {
  caller: AdminApiCaller;
  operation: string;
  params?: AdminApiCallParams;
  status: number;
}): Promise<void> {
  try {
    await prisma.adminApi_Call.create({
      data: {
        tokenId: input.caller.tokenId,
        actorUserId: input.caller.actorUserId,
        operation: input.operation,
        // The one place a param bag crosses into the Json column, so the cast
        // lives here rather than at every call site (see `AdminApiCallParams`).
        params: input.params as Prisma.InputJsonValue | undefined,
        status: input.status,
      },
    });
  } catch (err) {
    // Awaited (the log is the control, not a nice-to-have) but never fatal: a
    // hiccup writing the trail must not turn a good read into a 500 for the
    // caller. Loud in the pod logs so a systematic failure is noticed.
    console.error('[adminApi] failed to record call:', err);
  }
}

/**
 * Drop call rows older than `olderThanDays`. Called by the retention job: the
 * table is written on every call and would otherwise grow without bound, and the
 * pilot only ever reads recent history.
 */
export async function purgeAdminApiCalls(
  olderThanDays: number,
): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.adminApi_Call.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { deleted: count };
}
