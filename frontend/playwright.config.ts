import { defineConfig, devices } from '@playwright/test';

/**
 * The E2E suite runs against a REAL built server on the disposable test
 * database. `bun run test:e2e` goes through `scripts/with-test-db.sh`, which owns
 * every value that has to differ between two worktrees (`DATABASE_URL` and the
 * `PORT` / `ORIGIN` pair) and loads `.env.test`; everything below inherits that
 * environment.
 *
 * The `webServer` command is the same locally and in CI on purpose. A dev server
 * would boot faster, but then the run a developer does before pushing is not the
 * run that gates the merge, and this suite exists precisely so that
 * "I verified" is recontrollable by somebody else. It costs one build.
 *
 * For the same reason it never reuses a server it did not start (see
 * `reuseExistingServer` below), and the port it binds is derived per worktree by
 * `scripts/with-test-db.sh` rather than written in `.env.test`. The fallbacks
 * here are for a bare `bunx playwright test`; the gate always comes through the
 * wrapper.
 *
 * `KIT_OUTDIR` follows the rule in AGENTS.md: anything that loads the SvelteKit
 * vite plugin gets its own generated directory, or it blanks a dev server that
 * happens to be live in another terminal.
 *
 * Identity is declared per spec (or per `describe`) with `test.use({
 * storageState })`, reading the paths `auth.setup.ts` wrote. One browser project,
 * so adding a spec never means editing this file.
 */
const PORT = process.env.PORT ?? '4173';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  projects: [
    // Seeds the database and writes one storage state per role. A setup project
    // rather than `globalSetup` because only this one is guaranteed to run with
    // the `webServer` already up, and minting a session is an HTTP call to it.
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `KIT_OUTDIR=.svelte-kit-e2e bun --bun vite build && PORT=${PORT} bun ./build/index.js`,
    url: BASE_URL,
    // Never, not even locally. Reuse means "something answers on this port", and
    // Playwright cannot ask that something which build it is running or which
    // database it points at. With one port per worktree (derived alongside the
    // database name in `scripts/with-test-db.sh`) two concurrent gates no longer
    // land on the same port at all; with reuse still on, the residual case - a
    // leftover server, or two worktrees whose names hash to the same offset -
    // would skip the build and pass against foreign code, which is the failure
    // this whole suite exists to make impossible. Off, that case is an
    // EADDRINUSE: loud, and one line to read.
    reuseExistingServer: false,
    // A cold SvelteKit build plus a server boot. Generous rather than tight: a
    // timeout here reads as "the app is broken", which costs more to chase than
    // the wait costs to allow.
    timeout: 300_000,
    // Piped rather than swallowed: a boot failure (missing ORIGIN, unreachable
    // DATABASE_URL) is the first thing to read when the suite cannot connect.
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
