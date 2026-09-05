/**
 * The two branches of `assertGeneratorOwnsDataset`, exercised against a real
 * database.
 *
 * The generator's own `--check` proves what it produced. This proves what it
 * REFUSES, which nothing did: `check-seed-profiles.sh` only ever walked the
 * success case of all three gates, and the refusal branches had no coverage of
 * any kind. The one that shipped broken was the accepting branch, and it was
 * broken in the direction nothing notices - the first generation of an
 * environment worked, and only the second one failed, on a machine nobody runs
 * the suite from.
 *
 * It lives here rather than beside `guard.ts` because a `*.test.ts` under
 * `scripts/` runs nowhere: vitest collects under `src/` only, and
 * `scripts/lint-tests.ts` refuses a unit test outside it, so the file would be
 * silently dead. Hanging it off `check-seed-profiles.sh` instead puts it inside
 * the `test:seed` link that already provisions a real PostgreSQL, which this
 * needs anyway - the gate's count is raw SQL over `starts_with`.
 *
 * Runs LAST, after both profile generations, because it needs a generated
 * database to have something to accept.
 *
 * And it puts back everything it touches, in a `finally`, which is not tidiness.
 * `with-test-db.sh` reuses one disposable database across runs - the postgres
 * image declares its own volume, so only `docker compose down -v` really resets
 * it - so state this check leaves behind is state the NEXT run starts from. The
 * first version deleted the marker and stopped there, which made the suite pass
 * once and then refuse every later run, on the very refusal this file asserts. A
 * check that dirties a reused database is a check that breaks the thing it
 * guards.
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertGeneratorOwnsDataset } from './seed/guard';
import { MANIFEST_SETTING_KEY } from './seed/ids';

const PROBE_EMAIL = 'gate.probe@epitech.eu';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Marker = { key: string; value: string; updatedAt: Date };

/**
 * Throws rather than exiting, so the restore below still runs. An exit here
 * would leave the database in exactly the state this file exists to prevent.
 */
function fail(message: string): never {
  throw new Error(message);
}

/** Everything this check changed, put back exactly as it was. */
async function restore(marker: Marker): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: marker.key },
    update: { value: marker.value, updatedAt: marker.updatedAt },
    create: marker,
  });
  const probe = await prisma.bauth_user.findUnique({
    where: { email: PROBE_EMAIL },
    select: { id: true },
  });
  if (!probe) return;
  await prisma.staffProfile.deleteMany({ where: { userId: probe.id } });
  await prisma.bauth_user.delete({ where: { id: probe.id } });
}

async function run(marker: Marker): Promise<void> {
  // A staff account with a cuid id, which is what `bootstrap-admins.ts` leaves
  // behind and what every runtime writer into the five aggregate roots produces.
  const user = await prisma.bauth_user.create({
    data: {
      email: PROBE_EMAIL,
      name: 'Gate Probe',
      role: 'admin',
      emailVerified: true,
    },
  });
  const profile = await prisma.staffProfile.create({
    data: { userId: user.id, staffRole: 'admin' },
  });

  if (profile.id.startsWith('sd_')) {
    fail(
      'the probe StaffProfile carries a seed id, so it cannot stand for a runtime write',
    );
  }

  // Branch 1: the database has been generated, so a row it did not write is a
  // row the application legitimately added since. It must proceed.
  try {
    await assertGeneratorOwnsDataset(prisma);
  } catch (error) {
    fail(
      `a generated database carrying one admin account was refused: ${(error as Error).message}`,
    );
  }

  if (!(await prisma.staffProfile.findUnique({ where: { id: profile.id } }))) {
    fail('the gate removed the probe account instead of accepting it');
  }

  console.log('✓ generated database, one non-seeded StaffProfile: accepted');

  // Branch 2: without the marker the same database is one this generator has
  // never filled, which is the switchover, and the reset is a precondition.
  await prisma.appSetting.delete({ where: { key: MANIFEST_SETTING_KEY } });

  let refusal: Error | null = null;
  try {
    await assertGeneratorOwnsDataset(prisma);
  } catch (error) {
    refusal = error as Error;
  }

  if (!refusal) {
    fail(
      'a database with no generation marker and foreign rows was accepted; the switchover branch is gone',
    );
  }
  if (!refusal.message.includes('StaffProfile')) {
    fail(
      `the refusal does not name the offending table: ${refusal.message.split('\n')[0]}`,
    );
  }
  if (!refusal.message.includes('migrate reset')) {
    fail('the refusal does not say how to resolve it');
  }

  console.log('✓ no generation marker, foreign rows present: refused');
}

async function main(): Promise<void> {
  const marker = await prisma.appSetting.findUnique({
    where: { key: MANIFEST_SETTING_KEY },
  });
  if (!marker) {
    fail(
      'no manifest row: this check has to run after a generation, not before one',
    );
  }

  // A run that died between the two branches would have left these behind.
  await restore(marker);

  try {
    await run(marker);
  } finally {
    await restore(marker);
  }
}

main()
  .catch((error) => {
    console.error(`✗ ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
