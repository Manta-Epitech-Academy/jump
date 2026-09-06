/**
 * The onboarding gate, from the talent's side.
 *
 * The ladder itself is covered by the integration suites (they assert the
 * transaction, the XP facts and the funnel arithmetic). What only a browser can
 * assert is that the GUARD actually holds: that a talent who has signed nothing
 * cannot reach the app, and that one who has signed everything is not sent back
 * through the wizard.
 *
 * The second half is the one that has broken before. The flat onboarding columns
 * carry the MOST RECENT dossier, not the current year's, so reading them without
 * `onboardingFieldsForYear` sends a talent who signed last July back to step one
 * for good.
 */
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

test.describe('un talent qui n’a rien signé', () => {
  test.use({ storageState: storageStatePath(E2E.talentFresh.email) });

  test('voit la page de bienvenue avant tout le reste', async ({ page }) => {
    await page.goto('/');
    // The welcome splash comes first and exactly once (`welcomeSeenAt`), before
    // the wizard: it is gated on talent state, never on an event.
    await expect(page).toHaveURL((url) => url.pathname === '/welcome');
  });

  test('est renvoyé dans le tunnel depuis une page profonde', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/welcome' || url.pathname.startsWith('/onboarding'),
    );
  });
});

test.describe('un talent dont le dossier de l’année est complet', () => {
  test.use({ storageState: storageStatePath(E2E.talentReady.email) });

  test('atteint son tableau de bord', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL((url) => url.pathname === '/');
  });

  test('ne peut pas revenir dans le tunnel d’inscription', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL((url) => url.pathname === '/');
  });
});
