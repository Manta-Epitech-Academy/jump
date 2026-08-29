/**
 * Where this generator is allowed to write.
 *
 * It fails closed, on the doctrine `OUTBOUND_MODE`, `USAGE_SALT` and
 * `LOAD_TEST_SECRET` already follow here: no target named, nothing written. The
 * generator truncates before it fills, so the cost of getting this wrong is not
 * a messy database, it is a destroyed one.
 *
 * Two independent gates, and the order matters. A production or preproduction
 * connection string is refused first and unconditionally, before `--env` is even
 * consulted, so no combination of arguments can reach one. Only then does the
 * named target have to agree with the connection string, which catches the
 * ordinary mistake: the right command run against a shell that still carries
 * another environment's `DATABASE_URL`.
 */

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
