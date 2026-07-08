import { Prisma } from '@prisma/client';
import type { XpGrantSource } from '@prisma/client';

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
 *   - reward            → `${rewardId}_${talentId}` (see scripts/grant-reward-from-csv.ts)
 *   - admin_adjustment  → null (never deduped; each adjustment is its own row)
 */

export interface GrantXpInput {
  talentId: string;
  source: XpGrantSource;
  /** Required for every source except `admin_adjustment`. */
  sourceId: string | null;
  amount: number;
  campusId?: string | null;
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
async function recomputeTalentXp(
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
 * Recomputes `Talent.eventsCount` from émargement attendance. Kept as a cached
 * projection (like `xp`) rather than a ledger — it is directly derivable from the
 * `EventPresence` rows. An event counts as attended once the talent has at least
 * one présent/en-retard cell in it (absent/justifié don't count), so multiple
 * half-day slots of the same stage collapse to one via `distinct` on `eventId`.
 * Call from every site that writes an `EventPresence` row, in the same tx.
 */
export async function recomputeEventsCount(
  tx: Prisma.TransactionClient,
  talentId: string,
): Promise<number> {
  const attended = await tx.eventPresence.findMany({
    where: { talentId, status: { in: ['present', 'late'] } },
    distinct: ['eventId'],
    select: { eventId: true },
  });
  const eventsCount = attended.length;
  await tx.talent.update({ where: { id: talentId }, data: { eventsCount } });
  return eventsCount;
}

/**
 * Bulk variant of {@link recomputeEventsCount} for roster-scale writes (the
 * émargement "tout présent" mark): one correlated UPDATE instead of two round
 * trips per talent, so a ~200-talent créneau doesn't hold the interactive
 * transaction — and its `Talent` row locks — open across hundreds of
 * sequential queries. Same projection semantics as the single variant:
 * distinct events with at least one présent/en-retard cell.
 */
export async function recomputeEventsCountBulk(
  tx: Prisma.TransactionClient,
  talentIds: string[],
): Promise<void> {
  if (talentIds.length === 0) return;
  await tx.$executeRaw`
    UPDATE "Talent" t
    SET "eventsCount" = (
      SELECT COUNT(DISTINCT ep."eventId")::int
      FROM "EventPresence" ep
      WHERE ep."talentId" = t."id"
        AND ep."status" IN ('present', 'late')
    )
    WHERE t."id" IN (${Prisma.join(talentIds)})
  `;
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
      },
      create: {
        talentId: input.talentId,
        source: input.source,
        sourceId: input.sourceId,
        amount: input.amount,
        campusId: input.campusId ?? null,
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
