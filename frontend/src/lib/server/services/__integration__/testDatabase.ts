/**
 * Shared safety rail for the integration suites.
 *
 * They run against the disposable Postgres from `docker-compose.test.yml` (see
 * TESTING.md), NEVER the dev or prod database. This guard makes that structural:
 * if the configured database is not obviously the test one, we throw before
 * writing anything, so a careless `DATABASE_URL` can never inject test rows into
 * a real cohort. Worth remembering that the worktrees share one dev database, so
 * "the wrong DATABASE_URL" is a realistic accident here, not a theoretical one.
 */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  const isTestDb = url.includes('jump_test') || url.includes(':5434/');
  if (!isTestDb) {
    throw new Error(
      `Refusing to run integration tests against a non-test database ` +
        `(DATABASE_URL=${url || '(unset)'}). Start docker-compose.test.yml and ` +
        `run \`bun run test:integration\`, which loads .env.test.`,
    );
  }
}
