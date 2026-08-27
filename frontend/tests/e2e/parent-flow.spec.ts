/**
 * The guardian flow, which is the one space with no dashboard: a parent is
 * always somewhere in the flow, or on the thank-you page, and never anywhere
 * else.
 *
 * Worth a browser assertion rather than a unit test because the rule is not in
 * the page - it is in the guard, and it reads a COUNT over the guardian's
 * children (`parentBlockedWhere`). The two accounts here differ only by which
 * child they point at, so what is under test is exactly that predicate: the same
 * fragment the admin directory's "parent en attente" chip and the relance
 * audience read.
 */
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

test.describe('un responsable légal qui doit encore un acte', () => {
  test.use({ storageState: storageStatePath(E2E.parentPending.email) });

  test('est maintenu dans le parcours', async ({ page }) => {
    await page.goto('/parent/merci');
    await expect(page).toHaveURL((url) => url.pathname === '/parent/welcome');
  });
});

test.describe('un responsable légal qui ne doit plus rien', () => {
  test.use({ storageState: storageStatePath(E2E.parentSettled.email) });

  test('atterrit sur la page de fin', async ({ page }) => {
    await page.goto('/parent/welcome');
    await expect(page).toHaveURL((url) => url.pathname === '/parent/merci');
  });
});

test.describe('un talent', () => {
  test.use({ storageState: storageStatePath(E2E.talentReady.email) });

  test("n'entre pas dans l'espace parent", async ({ page }) => {
    await page.goto('/parent/welcome');
    // Two hops, both deliberate: the parent guard checks `role === 'parent'` and
    // bounces to the shared login entry point (`/login`; `/parent/login` 301s
    // there, see `domain/supportSurfaces.ts`), which then recognises the talent
    // session and lands them on their own dashboard. What this pins is the part
    // that matters: a talent session is not a guardian session, even when the
    // talent is that guardian's own child.
    await expect(page).toHaveURL((url) => url.pathname === '/');
  });
});
