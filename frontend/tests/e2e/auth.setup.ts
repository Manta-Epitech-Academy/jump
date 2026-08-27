/**
 * Seed the database, then mint one browser session per role.
 *
 * A Playwright **setup project** rather than `globalSetup`, because the ordering
 * matters and only one of the two guarantees it: a setup project runs as a test,
 * so the `webServer` is already up when it starts. `globalSetup` runs before the
 * server exists, and the session minting below is an HTTP call to that server.
 *
 * The sessions come from `/api/test/login-as`, which already exists for the
 * load-test driver: it inserts a `bauth_session` row and signs the cookie the
 * way `better-call` does, so `auth.api.getSession()` reads it back
 * indistinguishably from a real login. It 404s unless `LOAD_TEST_SECRET` is set
 * server-side, which the E2E environment sets for its own throwaway server and
 * nothing else does.
 *
 * Reusing it is the point. Staff authenticate through Microsoft OAuth and
 * talents through an emailed OTP, neither of which a headless run can walk, so
 * the alternative was a second endpoint that forges a session - a parallel auth
 * path, with a second copy of the cookie signing to keep in step with BetterAuth.
 */
import { test as setup, expect } from '@playwright/test';
import { seedE2eData } from './fixtures/seed';
import { E2E_ACCOUNTS, storageStatePath } from './fixtures/identities';

// One test, not one per role: the seed has to land before any session is
// minted, and a single sequential body says so without depending on how
// Playwright happens to order tests inside a project.
setup(
  'seed the database and mint one session per role',
  async ({ playwright, baseURL }) => {
    const secret = process.env.LOAD_TEST_SECRET;
    expect(
      secret,
      'LOAD_TEST_SECRET must be set for the E2E suite: /api/test/login-as 404s without it (see .env.test.example)',
    ).toBeTruthy();

    await seedE2eData();

    for (const account of E2E_ACCOUNTS) {
      // A fresh request context per role. Sharing one would accumulate every
      // session cookie in a single jar and each saved state would carry the
      // previous role's identity.
      const context = await playwright.request.newContext({ baseURL });

      const response = await context.post('/api/test/login-as', {
        headers: { Authorization: `Bearer ${secret}` },
        data: { email: account.email },
      });
      expect(
        response.ok(),
        `login-as failed for ${account.email}: ${response.status()} ${await response.text()}`,
      ).toBeTruthy();

      await context.storageState({ path: storageStatePath(account.email) });
      await context.dispose();
    }
  },
);
