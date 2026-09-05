/**
 * Where this generator is allowed to write.
 *
 * It fails closed, on the doctrine `OUTBOUND_MODE`, `USAGE_SALT` and
 * `LOAD_TEST_SECRET` already follow here: no target named, nothing written. The
 * generator truncates before it fills, so the cost of getting this wrong is not
 * a messy database, it is a destroyed one.
 *
 * Three independent gates, and the order matters. A production or preproduction
 * connection string is refused first and unconditionally, before `--env` is even
 * consulted, so no combination of arguments can reach one. Then the named target
 * has to agree with the connection string, which catches the ordinary mistake:
 * the right command run against a shell that still carries another
 * environment's `DATABASE_URL`. Both of those read the connection string alone,
 * so they can run before anything is opened.
 *
 * The third gate reads the database, and it is the one that says whether this
 * generator owns the dataset it is about to rewrite.
 */

import { MANIFEST_SETTING_KEY, SEED_ID_PREFIX } from './ids';

export const SEED_TARGETS = [
  'test',
  'dev',
  'livedev',
  'livedev2',
  'staging',
  'demo',
] as const;
export type SeedTarget = (typeof SEED_TARGETS)[number];

/**
 * Substrings that mean production, wherever they appear in the connection
 * string. Deliberately broad: a false refusal costs one message, a false
 * acceptance costs the platform.
 */
const FORBIDDEN = ['prod', 'preprod', 'epiboost.fr'];

export function isSeedTarget(value: string): value is SeedTarget {
  return (SEED_TARGETS as readonly string[]).includes(value);
}

function matchesTarget(target: SeedTarget, url: string): boolean {
  const local = url.includes('localhost') || url.includes('127.0.0.1');
  switch (target) {
    // Mirrors `assertTestDatabase()` in the integration suites: every name
    // `scripts/with-test-db.sh` derives carries `jump_test`, and 5434 is the
    // disposable container from docker-compose.test.yml.
    case 'test':
      return url.includes('jump_test') || url.includes(':5434/');
    case 'dev':
      return local || url.includes('jump-dev') || url.includes('postgres-dev');
    // Checked before `livedev`, since one name contains the other.
    case 'livedev2':
      return url.includes('livedev2');
    case 'livedev':
      return url.includes('livedev') && !url.includes('livedev2');
    case 'staging':
      return (
        url.includes('staging') ||
        url.includes('jump-stg') ||
        url.includes('postgres-staging')
      );
    case 'demo':
      return url.includes('demo');
  }
}

export function assertWritableTarget(
  target: string | undefined,
  databaseUrl: string | undefined,
): SeedTarget {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Refusing to guess a target.');
  }

  const haystack = databaseUrl.toLowerCase();
  const hit = FORBIDDEN.find((needle) => haystack.includes(needle));
  if (hit) {
    throw new Error(
      `DATABASE_URL looks like production ("${hit}"). This generator truncates before it fills and will never run there.`,
    );
  }

  if (!target) {
    throw new Error(
      `--env is required. One of: ${SEED_TARGETS.join(', ')}. Nothing is written without it.`,
    );
  }
  if (!isSeedTarget(target)) {
    throw new Error(
      `Unknown --env "${target}". One of: ${SEED_TARGETS.join(', ')}.`,
    );
  }
  if (!matchesTarget(target, haystack)) {
    throw new Error(
      `--env ${target} does not match DATABASE_URL. The connection string carries no marker for that environment, so one of the two is wrong.`,
    );
  }

  return target;
}

/**
 * The five aggregate roots, and the reason this list is these five rather than a
 * selection somebody made.
 *
 * `AGENTS.md` already names them, as the models every context reads and none
 * owns: `Talent`, `Event`, `Campus`, `School`, `StaffProfile`. What this gate
 * uses is the property that follows. No migration inserts one of them, so on a
 * freshly migrated database all five are empty, and a row in any of them was put
 * there by a sync, an import or a restore. So the list is the schema's own
 * doctrine rather than a set of tables picked to cover the symptom.
 *
 * Which is why it is not the models the generator writes, and not the models
 * carrying a unique constraint it would collide on. Migrations legitimately
 * insert rows the generator never wipes - the closing question bank, the stage
 * grid, the certificate templates - so a gate over everything would refuse the
 * one target that is always correct: a database that has just been migrated and
 * never seeded.
 *
 * **This count only decides the case where the database has never been
 * generated**, and reading it as a general test of ownership is what made it
 * wrong. Every one of these five is `@default(cuid())`, so no row the running
 * application writes can ever carry the seed prefix, and three of them are
 * written by ordinary use: `School` by any talent picking a lycée in the
 * onboarding wizard, `Talent` by any `@epitech.eu` Microsoft sign-in, and
 * `StaffProfile` by the first sign-in of any invited member - and by
 * `bootstrap-admins.ts`, which the switchover runs immediately. Applied to a
 * database this generator had already filled, the count therefore refused every
 * environment on its second run, starting with the one the switchover had just
 * finished setting up.
 */
const AGGREGATE_ROOT_TABLES = [
  'Campus',
  'School',
  'StaffProfile',
  'Talent',
  'Event',
] as const;

type RawQuery = {
  $queryRawUnsafe<T>(sql: string): Promise<T>;
};

/**
 * The anchor of the last full generation, or null if there has never been one.
 *
 * Read over the same raw interface as the count below rather than through the
 * `appSetting` delegate, so this module keeps asking a database for one thing:
 * a caller has to hand it `$queryRawUnsafe` and nothing else, which is also what
 * makes it testable without standing up a Prisma client.
 *
 * It reads `updatedAt` rather than the manifest itself because `index.ts` stamps
 * that column with `--today` instead of the wall clock, so the column IS the
 * previous anchor - a fact worth printing, and one that would otherwise have to
 * be parsed back out of a markdown page.
 */
async function lastGenerationAnchor(prisma: RawQuery): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<{ updatedAt: Date }[]>(
    `SELECT "updatedAt" FROM "AppSetting" WHERE "key" = '${MANIFEST_SETTING_KEY}'`,
  );
  const stamp = rows[0]?.updatedAt;
  return stamp ? new Date(stamp).toISOString().slice(0, 10) : null;
}

/**
 * Refuses a database this generator has never filled and that somebody else has.
 *
 * The question is "has this generator ever run here", and not "are there rows it
 * did not write". The second is a proxy for the first, and the difference is the
 * whole point: a database the generator has filled goes on accumulating rows it
 * did not write, because the application keeps being used, and every one of them
 * is legitimate.
 *
 * So: a marker, then the count. `MANIFEST_SETTING_KEY` is written at the end of
 * every full run and destroyed by `prisma migrate reset` (`ids.ts` says why it
 * survives everything in between). Present, and this generator owns the dataset;
 * absent, and the five aggregate roots above decide, exactly as they did before.
 *
 * The refusal names `migrate reset` rather than offering to do the deletion
 * itself, and that is deliberate. A reset here would have to truncate, and
 * `wipe()` explains at length why it must not: migrations insert rows no later
 * run restores, and `migrate deploy` will not put them back because from its
 * point of view the migration already ran. `migrate reset` replays them, which
 * is exactly the difference that matters, and it is also what clears the marker,
 * so the two halves of the answer cannot disagree.
 *
 * `--catalog-only` does not come through here. It is create-only by
 * construction, which is what makes it the one mode that is safe against a
 * populated database.
 *
 * **What this no longer stands in the way of**, said here because the count used
 * to cover it by refusing everything. `flush()` uses `createMany` without
 * `skipDuplicates`, so a database this generator owns, on which the application
 * has since taken a natural key the generator will write, fails on that unique
 * constraint after the wipe and the catalogue seeders have run - an admin
 * creating a campus named like a generated one (`Campus.name`), or a talent
 * resolving a lycée whose UAI falls in the synthetic band `catalog/schools.ts`
 * uses (`School.uai`). Catching that is a pre-flight over the schema's unique
 * constraints, which needs the buffered rows and therefore a later call site
 * than a gate that has to run before anything is written. It is not this
 * function's job, and it is not done anywhere yet.
 */
export async function assertGeneratorOwnsDataset(
  prisma: RawQuery,
  log: (message: string) => void = () => {},
): Promise<void> {
  const generatedAt = await lastGenerationAnchor(prisma);
  if (generatedAt) {
    log(
      `  base déjà générée (ancre précédente ${generatedAt}), rien à réinitialiser.`,
    );
    return;
  }

  const counts = AGGREGATE_ROOT_TABLES.map(
    (table) =>
      `(SELECT count(*)::int FROM "${table}" WHERE NOT starts_with(id, '${SEED_ID_PREFIX}')) AS "${table}"`,
  );
  const [row] = await prisma.$queryRawUnsafe<Record<string, number>[]>(
    `SELECT ${counts.join(', ')}`,
  );

  const foreign = AGGREGATE_ROOT_TABLES.filter(
    (table) => (row?.[table] ?? 0) > 0,
  ).map((table) => `${table} (${row![table]})`);

  if (foreign.length === 0) return;

  throw new Error(
    [
      `This generator has never run here, and the database already holds: ${foreign.join(', ')}.`,
      'The generation would fail part-way on a unique constraint, so it stops here instead.',
      'Reset the schema first, with `bunx prisma migrate deploy` replayed from scratch:',
      '  bunx prisma migrate reset --force',
      'A truncate is not an alternative: it destroys the rows migrations insert (the closing',
      'question bank, the stage grid, the certificate templates) and `migrate deploy` does not',
      'put them back.',
    ].join('\n'),
  );
}
