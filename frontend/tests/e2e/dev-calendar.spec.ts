/**
 * The dev space's front door (#440): a dev-team member lands on their campus's
 * calendar, not inside an event, and opens an event from it.
 *
 * The year view is the default, and the seeded event runs today, so its day is
 * a link named after the event on the grid. Following it crosses the calendar's
 * load (campus scoping, the dev-visibility gate) and the event's own landing
 * rule (`landingSurface`), which is the seam no unit test reaches.
 */
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

test.use({ storageState: storageStatePath(E2E.dev.email) });

test.describe('le calendrier du campus', () => {
  test("est la page d'arrivée et ouvre un événement", async ({ page }) => {
    await page.goto('/staff/dev');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Calendrier' }),
    ).toBeVisible();

    await page.getByRole('link', { name: /^Émargement E2E,/ }).click();

    await expect(page).toHaveURL(
      (url) => url.pathname === `/staff/dev/events/${E2E.eventId}/emargement`,
    );
  });
});
