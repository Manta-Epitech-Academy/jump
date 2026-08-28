import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { USAGE_RAW_RETENTION_MONTHS, usageRawCutoff } from '$lib/domain/usage';

export { USAGE_RAW_RETENTION_MONTHS };

/**
 * Fold every month present in the raw table into `Usage_FeatureMonthly`, then
 * purge raw rows past the retention window.
 *
 * The cutoff comes from `usageRawCutoff` rather than being computed here, so the
 * purge and the reader in `usage/read.ts` cannot disagree about where the
 * detailed window ends. They could before: the reader compared a day COUNT
 * against the retention while this compared a DATE.
 *
 * ONE job and not two, and the ordering is the entire reason. Folding first
 * guarantees no month is purged before it was counted; two jobs would make that
 * a scheduling assumption, and the purge would silently win a race nobody would
 * notice until a month was simply missing from every year-on-year figure.
 *
 * The fold is a DELETE-then-INSERT of the months being recomputed rather than an
 * upsert, for a reason worth writing down: `campusId` is nullable, a UNIQUE index
 * treats NULLs as distinct, so `ON CONFLICT` would never match a global-scope
 * row and every run would append a duplicate. Recomputing wholesale is also the
 * honest shape here, since the cube is a pure projection of the raw rows, the
 * same way `Talent.xp` is recomputed from its ledger rather than incremented.
 *
 * Only months that still have raw rows are deleted, so a month whose raw rows
 * are already gone keeps the figures it was folded with.
 *
 * Impersonated rows are excluded from the cube. An admin checking a campus is
 * not that campus adopting a feature; the flag stays on the raw row, where the
 * staff activity view can still show it.
 *
 * Idempotent: running it twice in a row changes nothing the second time.
 */
export async function rollUpUsage(now = new Date()): Promise<{
  monthsFolded: number;
  rowsWritten: number;
  rawPurged: number;
}> {
  const cutoff = usageRawCutoff(now);

  return prisma.$transaction(async (tx) => {
    const months = await tx.$queryRaw<{ month: string }[]>(
      Prisma.sql`
        SELECT DISTINCT to_char("occurredAt", 'YYYY-MM') AS month
        FROM "Usage_FeatureUse"
      `,
    );
    const monthLabels = months.map((m) => m.month);

    if (monthLabels.length > 0) {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "Usage_FeatureMonthly"
        WHERE "month" IN (${Prisma.join(monthLabels)})
      `);
    }

    // `gen_random_uuid()::text` rather than a cuid because the fold happens in
    // SQL and nothing references this id; it is a surrogate key for a projection
    // row that is deleted and rebuilt on every run.
    const rowsWritten = await tx.$executeRaw(Prisma.sql`
      INSERT INTO "Usage_FeatureMonthly" (
        "id", "feature", "actorKind", "campusId", "month",
        "uses", "distinctActors", "computedAt"
      )
      SELECT
        gen_random_uuid()::text,
        u."feature",
        u."actorKind",
        u."campusId",
        to_char(u."occurredAt", 'YYYY-MM'),
        COUNT(*)::int,
        COUNT(DISTINCT COALESCE(u."staffProfileId", u."actorHash"))::int,
        ${now}
      FROM "Usage_FeatureUse" u
      WHERE u."impersonated" = false
      GROUP BY
        u."feature", u."actorKind", u."campusId",
        to_char(u."occurredAt", 'YYYY-MM')
    `);

    const rawPurged = await tx.$executeRaw(Prisma.sql`
      DELETE FROM "Usage_FeatureUse" WHERE "occurredAt" < ${cutoff}
    `);

    return { monthsFolded: monthLabels.length, rowsWritten, rawPurged };
  });
}
