/**
 * The usage rollup, run between two generations of the same database.
 *
 * A generated environment does not stay as the generator left it: the
 * `/api/jobs/usage-rollup` cron runs there like anywhere else, re-keys every
 * cube month still present in `Usage_FeatureUse` under `gen_random_uuid()` ids
 * and purges the raw rows past the retention window. The next re-seed meets
 * that state, and `test:seed` never did, since its two generations ran back to
 * back. That gap is how every re-seed of `dev` failed from 20/10 on a unique key
 * of `Usage_FeatureMonthly` while `verify` stayed green (#432). Called by
 * `check-seed-profiles.sh` between its two generations, so the second one meets
 * the state the deployed job leaves.
 *
 * A COPY of `rollUpUsage` (`src/lib/server/usage/rollup.ts`), not a call to it.
 * That module reaches `$lib/server/db`, which does not resolve outside Vite, and
 * a generation runs under plain `bun` (`.claude/rules/seed.md`, "The domain is
 * imported, never restated"). The cutoff is the domain's own `usageRawCutoff`,
 * imported. If the job's fold changes, this copy follows it.
 *
 * `--at` is the job's clock. The generator never reads the wall clock and
 * neither does this: a date months after the anchor reproduces an environment
 * whose anchor stayed put while time passed, which is the case where the purge
 * removes raw months the next generation writes again.
 *
 * In this directory for the reason `check-gate.ts` gives: `bun run check` type
 * checks every file under it, and nothing type checks `scripts/` itself.
 */

import { Prisma } from '@prisma/client';
import { usageRawCutoff } from '../../src/lib/domain/usage';
import { createClient, loadEnv } from './context';

function parseAt(argv: readonly string[]): Date {
  const index = argv.indexOf('--at');
  const raw = index === -1 ? undefined : argv[index + 1];
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('--at YYYY-MM-DD is required: the job clock is explicit.');
  }
  const at = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`--at is not a real date: "${raw}".`);
  }
  return at;
}

loadEnv();
const prisma = createClient();

async function main(): Promise<void> {
  const now = parseAt(process.argv.slice(2));
  const cutoff = usageRawCutoff(now);

  const result = await prisma.$transaction(async (tx) => {
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

  if (result.rowsWritten === 0) {
    throw new Error(
      'the rollup folded nothing: the generation before it wrote no usage, so the re-seed after it proves nothing',
    );
  }
  console.log(
    `✓ rollup at ${now.toISOString().slice(0, 10)}: ${result.monthsFolded} month(s) re-keyed into ${result.rowsWritten} row(s), ${result.rawPurged} raw row(s) purged`,
  );
}

main()
  .catch((error) => {
    console.error(`✗ ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
