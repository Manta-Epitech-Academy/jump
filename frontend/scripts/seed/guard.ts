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

import { SEED_ID_PREFIX } from './ids';

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
 * there by a sync, an import or a restore. That is precisely the question below,
 * so the list is the schema's own doctrine rather than a set of tables picked to
 * cover the symptom.
 *
 * Which is why it is not the models the generator writes, and not the models
 * carrying a unique constraint it would collide on. Migrations legitimately
 * insert rows the generator never wipes - the closing question bank, the stage
 * grid, the certificate templates - so a gate over everything would refuse the
 * one target that is always correct: a database that has just been migrated and
 * never seeded.
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
 * Refuses a database that already holds data this generator did not write.
 *
 * Not hygiene: the generation cannot succeed. `flush()` uses `createMany`
 * without `skipDuplicates`, and `Campus.name` is unique, so a target carrying
 * the real campuses fails on `Campus_name_key` - after the catalogue seeders
 * have run, which leaves the database half written rather than untouched. dev
 * and staging are both in that state today, fed by the Salesforce worker and by
 * a restored dump, so this is the first thing a switchover meets.
 *
 * It names `migrate reset` rather than offering to do the deletion itself, and
 * that is deliberate. A reset here would have to truncate, and `wipe()` explains
 * at length why it must not: migrations insert rows no later run restores, and
 * `migrate deploy` will not put them back because from its point of view the
 * migration already ran. `migrate reset` replays them, which is exactly the
 * difference that matters.
 *
 * `--catalog-only` does not come through here. It is create-only by
 * construction, which is what makes it the one mode that is safe against a
 * populated database.
 */
export async function assertGeneratorOwnsDataset(
  prisma: RawQuery,
): Promise<void> {
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
      `This database already holds rows the generator did not write: ${foreign.join(', ')}.`,
      'The generation would fail part-way on a unique constraint, so it stops here instead.',
      'Reset the schema first, with `bunx prisma migrate deploy` replayed from scratch:',
      '  bunx prisma migrate reset --force',
      'A truncate is not an alternative: it destroys the rows migrations insert (the closing',
      'question bank, the stage grid, the certificate templates) and `migrate deploy` does not',
      'put them back.',
    ].join('\n'),
  );
}
