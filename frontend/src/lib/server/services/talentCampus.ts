import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * A Prisma client that may be the singleton or a transaction-scoped client.
 * The helpers here accept either so they compose inside a `$transaction`
 * (onboarding) as well as standalone (hooks).
 */
type Db = PrismaClient | Prisma.TransactionClient;

/**
 * A talent's effective campus, derived from their MOST RECENT participation.
 * Talents have no direct Campus FK; their campus is wherever they last
 * participated. Single source of truth for that rule, shared by `hooks.server`
 * (feature-flag scope + analytics name) and onboarding (early-bird campus +
 * cohort position) so the two can't drift.
 */
export async function resolveTalentCampus(
  client: Db,
  talentId: string,
): Promise<{ campusId: string | null; campusName: string | null }> {
  const participation = await client.participation.findFirst({
    where: { talentId },
    orderBy: { event: { date: 'desc' } },
    select: { campusId: true, campus: { select: { name: true } } },
  });
  return {
    campusId: participation?.campusId ?? null,
    campusName: participation?.campus?.name ?? null,
  };
}

/**
 * The talent's 0-based early-bird position within `campusId` for `schoolYear`:
 * how many talents have ALREADY completed onboarding there that year, capped at
 * `limit`. Positions at or
 * beyond the limit earn no bonus, so the exact count past it is never needed —
 * the cap lets the scan stop early and returns `min(completers, limit)`.
 *
 * MUST be called inside the transaction that stamps this talent's own
 * `rulesSignedAt`, and BEFORE that stamp, so the talent never counts itself
 * (its `rulesSignedAt` is still null at count time).
 *
 * Takes a per-campus advisory lock, released when the caller's transaction
 * commits, so concurrent completions in the same campus serialize. Without it
 * two students finishing in the same instant each read a snapshot taken before
 * the other committed (READ COMMITTED), both see the same count, and tie for the
 * same decaying tier — diluting the "first finisher" reward the tiers exist to
 * grant. A timestamp comparison would not fix this: the cutoff is each
 * transaction's own captured `now`, whose order can disagree with commit order.
 * The lock makes positions exact and gap-free, and is per-campus so unrelated
 * campuses never contend.
 *
 * Scoped to one school year through `Talent.onboardingSchoolYear`, the stamp on
 * the onboarding projection. Counting all-time completers instead would exhaust
 * a campus's early-bird tiers after its first cohort and silently retire the
 * reward, since the dossier is walked again every year.
 *
 * "Their campus" matches {@link resolveTalentCampus} exactly: the campus of each
 * completer's most-recent participation, NOT merely any participation here. A
 * talent whose latest campus is elsewhere but who once attended this one must
 * not count. The candidate set is reached through the indexed
 * `Participation.campusId` (never a full `Talent` scan), then the correlated
 * subquery confirms each candidate's latest participation really is this campus.
 */
export async function countCampusEarlyBirdPosition(
  tx: Prisma.TransactionClient,
  campusId: string,
  schoolYear: string,
  limit: number,
): Promise<number> {
  // Serialize same-campus completions; released when the caller's tx commits.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${campusId}))`;

  // Stop at `limit` matches: the bonus is 0 from there on, so a mature campus
  // never re-scans its whole all-time cohort just to learn the answer is "≥ N".
  const rows = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count FROM (
      SELECT 1
      FROM "Talent" t
      WHERE t."rulesSignedAt" IS NOT NULL
        AND t."onboardingSchoolYear" = ${schoolYear}
        AND t.id IN (
          SELECT p."talentId"
          FROM "Participation" p
          WHERE p."campusId" = ${campusId}
        )
        AND (
          SELECT p2."campusId"
          FROM "Participation" p2
          JOIN "Event" e ON e.id = p2."eventId"
          WHERE p2."talentId" = t.id
          ORDER BY e.date DESC
          LIMIT 1
        ) = ${campusId}
      LIMIT ${limit}
    ) capped
  `;
  return Number(rows[0]?.count ?? 0);
}
