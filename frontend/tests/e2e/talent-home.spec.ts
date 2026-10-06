/**
 * What a talent's home suggests, as the talent reads it. The writes, the
 * refusals, the rule that hides a passed highlight and the order the hero picks
 * in (`pickHomeHero`) have their own suites; what only a browser can show is
 * that each case reaches the page in its one place, and that every link leaving
 * Jump does so the safe way: a new tab, no opener.
 */
import { test, expect, type Locator } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

async function expectLeavesSafely(link: Locator, href: string) {
  await expect(link).toHaveAttribute('href', href);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
}

test.describe('un talent dont l’événement a lieu aujourd’hui', () => {
  test.use({ storageState: storageStatePath(E2E.talentReady.email) });

  test('lit le mot du campus, et voit l’événement mis en avant comme la suite de sa journée', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByText('Le mot du campus')).toBeVisible();
    await expectLeavesSafely(
      page.getByRole('link', { name: 'le Discord du campus' }),
      E2E.homeNoteLink,
    );

    // The day's activity leads; the campus's invitation is one line under it,
    // in the same hero, and nowhere else on the page.
    const hero = page.getByRole('region', { name: 'Ton activité du jour' });
    await expect(hero).toContainText('À venir');
    await expect(hero).toContainText(E2E.homeHighlightTitle);
    await expectLeavesSafely(
      hero.getByRole('link', { name: /Je m’inscris/ }),
      E2E.homeHighlightUrl,
    );
    await expect(page.getByText(E2E.homeHighlightTitle)).toHaveCount(1);
  });

  test('retrouve son historique dans « Mon parcours », et plus sur l’accueil', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('Événements passés')).toHaveCount(0);

    await page.getByRole('link', { name: /Mon parcours/ }).click();
    await expect(page).toHaveURL(/\/parcours$/);
    await expect(
      page.getByRole('heading', { name: 'Mon parcours' }),
    ).toBeVisible();
  });
});

test.describe('un talent sans activité aujourd’hui', () => {
  test.use({ storageState: storageStatePath(E2E.talentIdle.email) });

  test('voit l’événement mis en avant en tête, et la date de sa prochaine session', async ({
    page,
  }) => {
    await page.goto('/');

    const hero = page.getByRole('region', { name: E2E.homeHighlightTitle });
    await expect(hero).toBeVisible();
    await expectLeavesSafely(
      hero.getByRole('link', { name: /Je m’inscris/ }),
      E2E.homeHighlightUrl,
    );

    const session = page.getByRole('region', { name: 'Ta prochaine session' });
    await expect(session).toContainText(E2E.upcomingEventName);
    await expect(session).toContainText('14:00');
  });
});
