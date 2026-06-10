/**
 * Realign `bauth_user.email` onto `Talent.email` for talents whose Salesforce
 * email changed before the sync started propagating it (see services/syncService.ts).
 *
 * The bug: the worker sync updated `Talent.email` but never the linked
 * `bauth_user.email`. Talents log in via Email OTP, and BetterAuth resolves the
 * account by `bauth_user.email` at verify time — so a stale auth email locks the
 * talent out even though `Talent.email` is correct. This repairs the rows the
 * fix can't reach retroactively (the sync only re-patches when SF moves the email
 * again).
 *
 * Scope: only talents with a linked `userId` AND a non-empty `email` whose
 * `bauth_user.email` differs. Collisions (the target email already belongs to
 * another auth user, e.g. a parent) are skipped and reported, never forced.
 *
 * Idempotent: re-running converges (already-aligned rows are skipped).
 *
 * Run: bun run scripts/backfill-auth-email.ts [--dry-run]
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(
    `Auth email backfill — ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n`,
  );

  // Talents with a login account and a known email. We compare against the
  // linked user's email in memory rather than in SQL to keep the script simple
  // and provider-agnostic.
  const talents = await prisma.talent.findMany({
    where: { userId: { not: null }, email: { not: null } },
    select: {
      id: true,
      email: true,
      user: { select: { id: true, email: true } },
    },
  });

  const drifted = talents.filter(
    (t) => t.user && t.email && t.user.email !== t.email,
  );

  console.log(
    `Talents with account + email: ${talents.length} | drifted (auth ≠ talent): ${drifted.length}\n`,
  );

  let fixed = 0;
  let collisions = 0;

  for (const t of drifted) {
    const from = t.user!.email;
    const to = t.email!;
    console.log(`  ${t.id}  auth="${from}"  →  talent="${to}"`);

    if (dryRun) continue;

    try {
      await prisma.bauth_user.update({
        where: { id: t.user!.id },
        data: { email: to },
      });
      fixed++;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        collisions++;
        console.log(
          `    ⚠ skipped — "${to}" is already attached to another auth account`,
        );
        continue;
      }
      throw err;
    }
  }

  if (dryRun) {
    console.log('\nDRY RUN — no rows written.');
    return;
  }

  console.log(
    `\nDone. Realigned: ${fixed} | skipped (collision): ${collisions}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
