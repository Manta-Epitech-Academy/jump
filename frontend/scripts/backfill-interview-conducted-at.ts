/**
 * Backfill `conductedAt` on finalized interviews so it marks when the interview
 * was *finalized*, not when its row was first created.
 *
 * Why these are wrong: `Interview.conductedAt` defaults to `now()` at row
 * creation, which is when the dev first starts (or autosaves) the interview as
 * `in_progress`. Clôture only flipped `status` to `done` and never re-stamped
 * the date, so every interview finalized before the fix carries its *start*
 * time, off from its real completion by the interview's duration (and by days
 * for one left in progress and closed later). Everything downstream treats a
 * `done` interview's `conductedAt` as its completion date: the admin PDF list
 * orders and dates by it, so stale rows sort low and show the wrong day. The
 * conduct action now stamps `conductedAt = now()` at clôture; this realigns the
 * rows that predate that change.
 *
 * Proxy: for a `done` interview the last write was its clôture (done is locked
 * server-side, so nothing updates the row afterwards, and a reset deletes it
 * rather than updating it). So `updatedAt` is an accurate stand-in for the
 * finalization instant. We set `conductedAt = updatedAt`.
 *
 * Scope: only `status = 'done'` rows where `conductedAt < updatedAt`. One-shot
 * closes (created straight to `done`) already have the two within a tick of each
 * other and are skipped.
 *
 * Why raw SQL, not prisma.update(): `@updatedAt` would auto-bump `updatedAt` on
 * every client update, clobbering the proxy we read and making a re-run drift
 * `conductedAt` forward. A single `SET "conductedAt" = "updatedAt"` statement
 * leaves `updatedAt` untouched.
 *
 * Idempotent: after the run the touched rows have `conductedAt = updatedAt`, so
 * the `conductedAt < updatedAt` guard matches nothing on a second pass.
 *
 * Run: bun run scripts/backfill-interview-conducted-at.ts [--dry-run]
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const dryRun = process.argv.includes('--dry-run');

type SampleRow = {
  id: string;
  prenom: string;
  nom: string;
  conductedAt: Date;
  updatedAt: Date;
};

function fmt(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

async function main() {
  console.log(
    `Interview conductedAt backfill: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n`,
  );

  const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM "Interview"
    WHERE "status"::text = 'done' AND "conductedAt" < "updatedAt"`;

  console.log(`Finalized interviews with a stale conductedAt: ${count}`);

  if (count === 0) {
    console.log('\nNothing to backfill.');
    return;
  }

  // Show the worst-affected rows (largest start→finish gap) so the operator can
  // sanity-check the shift before any write.
  const sample = await prisma.$queryRaw<SampleRow[]>`
    SELECT i.id, t.prenom, t.nom, i."conductedAt", i."updatedAt"
    FROM "Interview" i
    JOIN "Talent" t ON t.id = i."talentId"
    WHERE i."status"::text = 'done' AND i."conductedAt" < i."updatedAt"
    ORDER BY i."updatedAt" - i."conductedAt" DESC
    LIMIT 10`;

  console.log('\nLargest shifts (start → finalized):');
  for (const r of sample) {
    console.log(
      `  ${r.prenom} ${r.nom}: ${fmt(r.conductedAt)}  →  ${fmt(r.updatedAt)}`,
    );
  }

  if (dryRun) {
    console.log('\nDRY RUN: no rows written.');
    return;
  }

  console.log('\nWriting…');
  const affected = await prisma.$executeRaw`
    UPDATE "Interview"
    SET "conductedAt" = "updatedAt"
    WHERE "status"::text = 'done' AND "conductedAt" < "updatedAt"`;

  console.log(`\nDone. Re-stamped ${affected} interview(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
