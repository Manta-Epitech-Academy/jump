/**
 * Backfill the XP ledger (`XpGrant`) from existing talent state, then recompute
 * each talent's cached `xp` and `eventsCount` from the reconstructed facts.
 *
 * Run AFTER the `xp_ledger` migration (which creates the empty table and drops
 * `Talent.level`) and BEFORE reopening traffic — the app now derives `Talent.xp`
 * from the ledger, so a write before this backfill would recompute from an empty
 * ledger and zero a talent. See the plan's deploy section.
 *
 * Reconstructed sources (mirrors services/xpService.ts grant keys):
 *   - onboarding        → talents with charterAcceptedAt set        (WELCOME_XP_BONUS)
 *   - minigame          → every MinigameAttempt with xpAwarded set   (its xpAwarded)
 *   - activity_presence → every present Participation                (getTotalXp(...))
 *
 * Idempotent: all grants upsert on (source, sourceId), so re-running converges.
 * Drift between the old stored `xp` and the rebuilt SUM is expected and reported
 * — past `Math.max(0, …)` refund clamps inflated balances (positive delta) and
 * stacked onboarding re-runs collapse to a single +200 (negative delta).
 *
 * Run: bun run scripts/backfill-xp-ledger.ts [--dry-run]
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  WELCOME_XP_BONUS,
  getTotalXp,
  getXpEligibleActivities,
} from '../src/lib/domain/xp';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const dryRun = process.argv.includes('--dry-run');

type PlannedGrant = {
  talentId: string;
  source: 'onboarding' | 'minigame' | 'activity_presence';
  sourceId: string;
  amount: number;
  campusId: string | null;
};

async function main() {
  console.log(
    `XP ledger backfill — ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n`,
  );

  const talents = await prisma.talent.findMany({
    select: {
      id: true,
      xp: true,
      charterAcceptedAt: true,
      participations: {
        select: {
          id: true,
          isPresent: true,
          campusId: true,
          activities: {
            select: {
              isPresent: true,
              activity: { select: { activityType: true, difficulte: true } },
            },
          },
        },
        orderBy: { event: { date: 'desc' } },
      },
      minigameAttempts: {
        where: { xpAwarded: { not: null } },
        select: { id: true, xpAwarded: true, campusId: true },
      },
    },
  });

  const planned: PlannedGrant[] = [];
  const target = new Map<string, { xp: number; eventsCount: number }>();
  let totalDrift = 0;
  let driftRows = 0;

  for (const t of talents) {
    const grants: PlannedGrant[] = [];

    // onboarding — campus = most-recent participation (already date-desc), else null
    if (t.charterAcceptedAt) {
      grants.push({
        talentId: t.id,
        source: 'onboarding',
        sourceId: t.id,
        amount: WELCOME_XP_BONUS,
        campusId: t.participations[0]?.campusId ?? null,
      });
    }

    // minigame — one grant per awarded attempt
    for (const a of t.minigameAttempts) {
      grants.push({
        talentId: t.id,
        source: 'minigame',
        sourceId: a.id,
        amount: a.xpAwarded ?? 0,
        campusId: a.campusId,
      });
    }

    // activity_presence — one grant per present participation
    let eventsCount = 0;
    for (const p of t.participations) {
      if (!p.isPresent) continue;
      eventsCount += 1;
      grants.push({
        talentId: t.id,
        source: 'activity_presence',
        sourceId: p.id,
        amount: getTotalXp(getXpEligibleActivities(p.activities)),
        campusId: p.campusId,
      });
    }

    const xp = grants.reduce((sum, g) => sum + g.amount, 0);
    target.set(t.id, { xp, eventsCount });
    planned.push(...grants);

    const delta = xp - t.xp;
    if (delta !== 0) {
      driftRows += 1;
      totalDrift += delta;
      console.log(
        `  ${t.id}  stored=${t.xp}  rebuilt=${xp}  delta=${delta > 0 ? '+' : ''}${delta}`,
      );
    }
  }

  console.log(
    `\nTalents: ${talents.length} | grants planned: ${planned.length} | with drift: ${driftRows} | net drift: ${totalDrift > 0 ? '+' : ''}${totalDrift}`,
  );

  if (dryRun) {
    console.log('\nDRY RUN — no rows written.');
    return;
  }

  console.log('\nWriting grants…');
  for (const g of planned) {
    await prisma.xpGrant.upsert({
      where: { source_sourceId: { source: g.source, sourceId: g.sourceId } },
      update: { amount: g.amount, campusId: g.campusId, talentId: g.talentId },
      create: g,
    });
  }

  console.log('Recomputing talent projections…');
  for (const [talentId, { xp, eventsCount }] of target) {
    await prisma.talent.update({
      where: { id: talentId },
      data: { xp, eventsCount },
    });
  }

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
