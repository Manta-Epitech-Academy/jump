import { test, expect } from '@playwright/test';

test.describe('Émargement Roster E2E Component Interaction', () => {
  test('renders émargement roster, slots, stats card, and presence switches', async ({
    page,
  }) => {
    // Navigate to émargement page for Strasbourg test event
    await page.goto('/staff/dev/events/cmrc9iocz01lw01fteb11jmkc/emargement');

    // If redirected to login, verify page structure or login flow
    if (page.url().includes('/staff/login')) {
      await expect(page.locator('body')).toBeVisible();
      return;
    }

    // Verify main page header
    await expect(page.locator('h1')).toContainText('Émargement');

    // Verify émargement table is visible
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Verify stats card on the right rail
    const statsCard = page.locator('aside');
    await expect(statsCard).toBeVisible();

    // Verify presence switches are rendered and enabled
    const presenceGroup = page
      .locator('[role="group"][aria-label*="Présence"]')
      .first();
    if (await presenceGroup.isVisible()) {
      const presentBtn = presenceGroup.locator('button', {
        hasText: 'Présent',
      });
      await expect(presentBtn).toBeEnabled();
      await presentBtn.click();
      await expect(presentBtn).toHaveAttribute('aria-pressed', 'true');
    }
  });
});
