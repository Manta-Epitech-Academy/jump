/**
 * Recompute every talent's cached `Talent.xp` from the `XpGrant` ledger.
 *
 * `Talent.xp` is a cached projection = SUM(XpGrant.amount), normally refreshed
 * transactionally on every grant/revoke by `recomputeTalentXp` in
 * services/xpService.ts. This is the bulk, standalone version of that recompute:
 * a repair tool that re-derives the projection for ALL talents straight from the
 * ledger, for when a balance has drifted from its grants (e.g. grants edited or
 * inserted out-of-band, or a projection write that never ran).
 *
 * It reads the ACTUAL `XpGrant` table across every source (onboarding, minigame,
 * reward, admin_adjustment, and their bonus variants), so unlike
 * `backfill-xp-ledger.ts` it neither reconstructs the ledger nor drops reward /
 * admin_adjustment XP. Use
 * backfill to rebuild the ledger itself from talent state; use this to refresh
 * the cached balance from whatever the ledger currently holds.
 *
 * A talent with no grants is set to 0 (so a stale positive balance with an empty
 * ledger is corrected down). Only talents whose stored `xp` differs from the
 * recomputed sum are written; the rest are left untouched. Idempotent: a second
 * run reports zero drift. Does NOT touch `eventsCount` (a separate projection).
 *
 * Self-contained on purpose (no `$lib` import): like the sibling scripts it must
 * run against the production image where Vite aliases do not resolve.
 *
 * Safety: a dry run writes nothing. A live write against a non-local
 * DATABASE_URL (e.g. prod) requires `--force`. Always --dry-run first to read
 * the drift before correcting balances.
 *
 * Run:
 *   bun scripts/recompute-talent-xp.ts --dry-run        # report drift, write nothing
 *   bun scripts/recompute-talent-xp.ts --force          # write (non-local DB)
 */
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const has = (name: string) => process.argv.includes(`--${name}`);
const dryRun = has('dry-run');
const force = has('force');

// Cap how many drift rows we print so a large repair stays readable; the
// summary line always reports the true totals.
const PRINT_CAP = 100;
// Batch projection writes so the per-row round-trips against a remote DB don't
// serialize into a slow crawl (no wrapping transaction: each talent's xp is
// independent and the whole run is idempotent, so partial progress is safe).
const WRITE_BATCH = 25;

function die(msg: string): never {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

async function main() {
  console.log(
    `Recompute Talent.xp from XpGrant: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}${
      force ? ' [--force]' : ''
    }\n`,
  );

  // One grouped read gives the target balance per talent that HAS grants.
  const sums = await prisma.xpGrant.groupBy({
    by: ['talentId'],
    _sum: { amount: true },
  });
  const targetByTalent = new Map<string, number>(
    sums.map((s) => [s.talentId, s._sum.amount ?? 0]),
  );

  // Every talent, so a stored balance with an empty ledger is zeroed too.
  const talents = await prisma.talent.findMany({
    select: { id: true, xp: true },
  });

  type Drift = { id: string; stored: number; rebuilt: number };
  const drift: Drift[] = [];
  let netDrift = 0;
  for (const t of talents) {
    const rebuilt = targetByTalent.get(t.id) ?? 0;
    if (rebuilt !== t.xp) {
      drift.push({ id: t.id, stored: t.xp, rebuilt });
      netDrift += rebuilt - t.xp;
    }
  }

  for (const d of drift.slice(0, PRINT_CAP)) {
    const delta = d.rebuilt - d.stored;
    console.log(
      `  ${d.id}  stored=${d.stored}  rebuilt=${d.rebuilt}  delta=${delta > 0 ? '+' : ''}${delta}`,
    );
  }
  if (drift.length > PRINT_CAP)
    console.log(`  … and ${drift.length - PRINT_CAP} more`);

  console.log(
    `\nTalents: ${talents.length} | with grants: ${targetByTalent.size} | drifted: ${drift.length} | net drift: ${netDrift > 0 ? '+' : ''}${netDrift}\n`,
  );

  if (!drift.length) {
    console.log('Nothing to do: every Talent.xp already matches the ledger.');
    return;
  }

  if (dryRun) {
    console.log('DRY RUN: no rows written.');
    return;
  }

  const url = process.env.DATABASE_URL ?? '';
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (!isLocal && !force)
    die(
      'Refusing to write: DATABASE_URL is not local.\n' +
        'Re-run with --force to target this database (e.g. prod).',
    );

  console.log(`Writing ${drift.length} corrected balances…`);
  let written = 0;
  for (let i = 0; i < drift.length; i += WRITE_BATCH) {
    const chunk = drift.slice(i, i + WRITE_BATCH);
    await Promise.all(
      chunk.map((d) =>
        prisma.talent.update({ where: { id: d.id }, data: { xp: d.rebuilt } }),
      ),
    );
    written += chunk.length;
  }

  console.log(`Done. ${written} talents corrected.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
