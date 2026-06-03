/**
 * Backfill `campusId`/`eventId` on finalized minigame attempts that were minted
 * with no campus context (the talent had no participation at mint, so both were
 * stamped null and the run landed on the *global* board).
 *
 * Why these are stranded: the leaderboard a talent sees is now scoped to the
 * `campusId` on their own attempt (see services/minigameService.ts
 * `resolveLeaderboardScope`), and a finalized attempt can't be replayed
 * (eligibility blocks it), so a null-campus row keeps the talent on the global
 * board forever even once they belong to a campus. Re-stamping from their
 * closest event moves them onto the right campus board.
 *
 * Scope: only `status = 'done'` attempts with `campusId IS NULL`. Pending rows
 * self-heal at finish (the callback re-resolves the board), and a non-null
 * campus is never overwritten: a known board is correct, and the rank bonus was
 * already paid on it (no clawback). Already-paid `rankXpAwarded` is left as-is;
 * this only changes which board the talent is *shown*, never their balance.
 *
 * CAVEAT (time-relative): a null-campus row carries zero campus signal, so the
 * only source is the talent's closest event *as of now*. For a recent attempt
 * that's almost certainly their stage campus; for an old one it may mis-assign
 * if the talent has since moved campus. Minigame boards are daily and keyed per
 * publication, so the blast radius is one publication's display. Rows whose
 * talent has no participation at all stay null (global) and are logged.
 *
 * Idempotent: a second run finds no null-campus done rows left to fill.
 *
 * Run: bun run scripts/backfill-minigame-attempt-campus.ts [--dry-run]
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const dryRun = process.argv.includes('--dry-run');

// Inlined from services/minigameService.ts `getClosestEventForTalent` so the
// script can run inside the production image (no raw `src/`, `$lib` resolves
// only under Vite). Keep in sync by inspection: ongoing today → upcoming → most
// recent past, returning that participation's event + campus.
async function resolveClosestCampus(
  talentId: string,
): Promise<{ eventId: string; campusId: string } | null> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const ongoing = await prisma.participation.findFirst({
    where: {
      talentId,
      event: {
        date: { lte: endOfDay },
        OR: [
          { endDate: { gte: startOfDay } },
          { endDate: null, date: { gte: startOfDay } },
        ],
      },
    },
    orderBy: { event: { date: 'desc' } },
    select: { eventId: true, campusId: true },
  });
  if (ongoing) return ongoing;

  const upcoming = await prisma.participation.findFirst({
    where: { talentId, event: { date: { gt: endOfDay } } },
    orderBy: { event: { date: 'asc' } },
    select: { eventId: true, campusId: true },
  });
  if (upcoming) return upcoming;

  return prisma.participation.findFirst({
    where: { talentId, event: { date: { lt: startOfDay } } },
    orderBy: { event: { date: 'desc' } },
    select: { eventId: true, campusId: true },
  });
}

async function main() {
  console.log(
    `Minigame attempt campus backfill: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n`,
  );

  const stranded = await prisma.minigameAttempt.findMany({
    where: { status: 'done', campusId: null },
    select: { id: true, talentId: true, publicationId: true },
  });

  const planned: { id: string; eventId: string; campusId: string }[] = [];
  let noContext = 0;

  for (const a of stranded) {
    const closest = await resolveClosestCampus(a.talentId);
    if (!closest) {
      noContext += 1;
      console.log(
        `  ${a.id}  talent=${a.talentId}  → no participation, left global`,
      );
      continue;
    }
    planned.push({
      id: a.id,
      eventId: closest.eventId,
      campusId: closest.campusId,
    });
    console.log(
      `  ${a.id}  talent=${a.talentId}  → campus=${closest.campusId}`,
    );
  }

  console.log(
    `\nDone attempts with null campus: ${stranded.length} | re-stampable: ${planned.length} | left global (no participation): ${noContext}`,
  );

  if (dryRun) {
    console.log('\nDRY RUN: no rows written.');
    return;
  }

  console.log('\nWriting…');
  for (const p of planned) {
    await prisma.minigameAttempt.update({
      where: { id: p.id },
      data: { eventId: p.eventId, campusId: p.campusId },
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
