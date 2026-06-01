import type { Prisma, XpGrantSource } from '@prisma/client';

/**
 * XP ledger service.
 *
 * `XpGrant` is the source of truth: one row per granting fact, keyed unique on
 * `(source, sourceId)`. `Talent.xp` is a cached projection = SUM(amount),
 * recomputed inside the same transaction on every write — so a balance is
 * always explainable and can never drift (no more `Math.max(0, xp - n)` refund).
 *
 * Every function takes a `Prisma.TransactionClient`: callers own the
 * `prisma.$transaction(async (tx) => …)` so the grant/revoke and the projection
 * recompute commit atomically. The service is campus-agnostic — callers pass
 * `campusId` explicitly from data they already hold (and authorize the campus
 * via the scoped read in front of the transaction).
 *
 * `sourceId` is the per-source dedupe key:
 *   - onboarding        → talentId
 *   - minigame          → minigameAttemptId
 *   - activity_presence → participationId
 *   - admin_adjustment  → null (never deduped; each adjustment is its own row)
 */

export interface GrantXpInput {
  talentId: string;
  source: XpGrantSource;
  /** Required for every source except `admin_adjustment`. */
  sourceId: string | null;
  amount: number;
  campusId?: string | null;
  note?: string | null;
}

export interface RevokeXpInput {
  talentId: string;
  source: XpGrantSource;
  sourceId: string;
}

/**
 * Recomputes `Talent.xp` from the ledger. Call after any grant/revoke; runs
 * inside the caller's transaction.
 */
export async function recomputeTalentXp(
  tx: Prisma.TransactionClient,
  talentId: string,
): Promise<number> {
  const agg = await tx.xpGrant.aggregate({
    where: { talentId },
    _sum: { amount: true },
  });
  const xp = agg._sum.amount ?? 0;
  await tx.talent.update({ where: { id: talentId }, data: { xp } });
  return xp;
}

/**
 * Recomputes `Talent.eventsCount` from present participations. Kept as a cached
 * projection (like `xp`) rather than a ledger — it is directly derivable as the
 * count of the talent's present participations. Call from presence-driven sites.
 */
export async function recomputeEventsCount(
  tx: Prisma.TransactionClient,
  talentId: string,
): Promise<number> {
  const eventsCount = await tx.participation.count({
    where: { talentId, isPresent: true },
  });
  await tx.talent.update({ where: { id: talentId }, data: { eventsCount } });
  return eventsCount;
}

/**
 * Records (or updates) an XP grant and refreshes the talent's cached balance.
 * Upserts on `(source, sourceId)` so a repeated grant for the same fact never
 * stacks, and a changed amount (e.g. an activity's difficulty edited between
 * mark/unmark) is corrected in place. `admin_adjustment` always inserts a new
 * row (no dedupe key).
 */
export async function grantXp(
  tx: Prisma.TransactionClient,
  input: GrantXpInput,
): Promise<void> {
  if (input.source !== 'admin_adjustment' && !input.sourceId) {
    throw new Error(`grantXp: source "${input.source}" requires a sourceId`);
  }

  if (input.source === 'admin_adjustment') {
    await tx.xpGrant.create({
      data: {
        talentId: input.talentId,
        source: input.source,
        sourceId: null,
        amount: input.amount,
        campusId: input.campusId ?? null,
        note: input.note ?? null,
      },
    });
  } else {
    await tx.xpGrant.upsert({
      where: {
        source_sourceId: { source: input.source, sourceId: input.sourceId! },
      },
      update: {
        amount: input.amount,
        campusId: input.campusId ?? null,
        note: input.note ?? null,
      },
      create: {
        talentId: input.talentId,
        source: input.source,
        sourceId: input.sourceId,
        amount: input.amount,
        campusId: input.campusId ?? null,
        note: input.note ?? null,
      },
    });
  }

  await recomputeTalentXp(tx, input.talentId);
}

/**
 * Removes the grant for a fact that stopped being true (unmark presence, remove
 * participation, onboarding/dev reset) and refreshes the cached balance.
 * Idempotent: a no-op when no matching grant exists.
 */
export async function revokeXp(
  tx: Prisma.TransactionClient,
  input: RevokeXpInput,
): Promise<void> {
  await tx.xpGrant.deleteMany({
    where: { source: input.source, sourceId: input.sourceId },
  });
  await recomputeTalentXp(tx, input.talentId);
}
