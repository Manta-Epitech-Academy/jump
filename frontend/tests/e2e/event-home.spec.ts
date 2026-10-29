/**
 * The event home (#443): the event's name in the menu opens it, a part of a
 * card opens the page its figure comes from, filtered on that part, and a
 * section the event does not run has no card, as it has no page. The figures and the address
 * each part writes are unit-tested (`eventHome.test.ts`); this checks the seam
 * between a card, the router and the list that reads the address.
 *
 * The fixture's roster: ROSTERUN (Seconde, femme), ROSTERDEUX (Seconde, homme),
 * ROSTERTROIS (Première, femme), on an event that runs Inscrits only.
 */
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

test.use({ storageState: storageStatePath(E2E.dev.email) });

test.describe("l'accueil d'un événement", () => {
  test('ouvre les inscrits filtrés sur la part cliquée', async ({ page }) => {
    await page.goto(`/staff/dev/events/${E2E.rosterEventId}/inscrits`);
    // The event's own block in the menu, not an entry among its pages.
    await page
      .getByRole('navigation', { name: "Menu de l'espace dev" })
      .getByRole('link', { name: /Inscrits E2E/ })
      .click();
    await expect(page).toHaveURL(
      (url) => url.pathname === `/staff/dev/events/${E2E.rosterEventId}`,
    );

    await expect(
      page.getByRole('heading', { level: 1, name: /Inscrits E2E/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: /Inscrits par niveau/ }),
    ).toBeVisible();
    // No closing grid and no questionnaire on this event: no card for either.
    await expect(
      page.getByRole('heading', { level: 2, name: /Closings/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 2, name: /Feedback/ }),
    ).toHaveCount(0);

    await page.getByRole('link', { name: /^Seconde\s+2\b/ }).click();

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/staff/dev/events/${E2E.rosterEventId}/inscrits` &&
        url.searchParams.get('niveau') === 'Seconde',
    );
    const rows = page.getByRole('row').filter({ hasText: 'ROSTER' });
    await expect(rows).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: 'Retirer le filtre Niveau : Seconde' }),
    ).toBeVisible();
  });
});
