/**
 * The dev space's front door (#440): a dev-team member lands on their campus's
 * calendar, not inside an event, and opens an event from it.
 *
 * The year view is the default, and the seeded event runs today, so its day is
 * on the grid, named after the event, and opens a card with a button to the
 * event. Following it crosses the calendar's load (campus scoping, the
 * dev-visibility gate) and lands on the event's home (#443), which every event
 * opens on.
 *
 * The way back keeps the year (#533): from an event of last school year, the
 * menu's « Calendrier » opens the calendar that lists it, not today's, and
 * stays lit there although its address carries the year.
 */
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

test.use({ storageState: storageStatePath(E2E.dev.email) });

test.describe('le calendrier du campus', () => {
  test("est la page d'arrivée et ouvre un événement", async ({ page }) => {
    await page.goto('/staff/dev');

    // The heading greets whoever opens the page, by the hour; the page's
    // name is its document title and the line under the greeting.
    await expect(page).toHaveTitle('Calendrier');

    await page.getByRole('button', { name: /: Émargement E2E$/ }).click();
    await page.getByRole('link', { name: "Ouvrir l'événement" }).click();

    await expect(page).toHaveURL(
      (url) => url.pathname === `/staff/dev/events/${E2E.eventId}`,
    );
  });

  test("ramène à l'année de l'événement ouvert", async ({ page }) => {
    await page.goto(`/staff/dev/events/${E2E.lastYearEventId}`);

    const calendarLink = page.getByRole('link', { name: 'Calendrier' });
    await calendarLink.click();

    await expect(page).toHaveURL(
      (url) => url.pathname === '/staff/dev' && url.searchParams.has('year'),
    );
    await expect(
      page.getByRole('button', {
        name: new RegExp(`: ${E2E.lastYearEventName}$`),
      }),
    ).toBeVisible();
    await expect(calendarLink).toHaveAttribute('aria-current', 'page');
  });
});
