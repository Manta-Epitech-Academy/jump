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
 * It is not a `*.test.ts`, and it is in this directory, and the two are
 * separate decisions.
 *
 * Not a test file, because one under `scripts/` runs nowhere: vitest collects
 * under `src/` only, and `lint-tests.ts` refuses a unit test outside it, so the
 * file would be silently dead. It hangs off `check-seed-profiles.sh` instead,
 * which puts it inside the `test:seed` link that already provisions a real
 * PostgreSQL - which this needs anyway, since the gate's count is raw SQL over
 * `starts_with`.
 *
 * In this directory, because `tsconfig.json` here includes every `.ts` file
 * under it and `bun run check` runs it. `scripts/` itself is type-checked by
 * nothing - the tsconfig SvelteKit generates covers `src/`, `test/` and
 * `tests/` - and bun strips types without checking them, so a check sitting one
 * level up would go on running, and could go on passing, after the signature it
 * exercises had moved under it. The only coverage `guard.ts` has is not a good
 * place to lose a type check.
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

import { createClient, loadEnv } from './context';
import { assertGeneratorOwnsDataset } from './guard';
import { MANIFEST_SETTING_KEY } from './ids';

const PROBE_EMAIL = 'gate.probe@epitech.eu';

// The generator's own two, rather than a second copy: `loadEnv` is where the
// path to the repo-root `.env` lives, and `createClient` is what refuses an
// unset `DATABASE_URL` with a sentence instead of an adapter error.
loadEnv();
const prisma = createClient();

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
