/**
 * EpiDuck as the talent meets him (#539). His state machine, what he may say
 * and the writes behind both have their own suites; what only a browser shows
 * is that he is in every talent header, that a tap makes him speak, that the
 * name given in the settings reaches the header, and that putting him to sleep
 * survives a change of page, which is the reason his state is not kept in the
 * header that draws him.
 */
import { test, expect, type Locator } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

/**
 * Clicks a control whose state the server keeps, and waits until it is kept:
 * the next full page load reads what the server holds, and a navigation that
 * leaves first takes the request with it.
 */
async function stored(control: Locator): Promise<void> {
  const page = control.page();
  const answered = page.waitForResponse(
    (r) => r.url().includes('/_app/remote/') && r.request().method() === 'POST',
  );
  await control.click();
  expect((await answered).ok()).toBe(true);
}

test.describe('le canard EpiDuck d’un talent', () => {
  test.use({
    storageState: storageStatePath(E2E.talentIdle.email),
    // A swimming duck never holds still long enough for a click to be judged
    // stable. Asked for less motion, he stays put, which is the path this
    // also proves: he still answers, sleeps and wakes, by fades.
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('parle quand on le touche, prend le nom qu’on lui donne, et dort sur toutes les pages', async ({
    page,
  }) => {
    await page.goto('/');
    const said = page.locator('p[aria-live="polite"]');

    // A tap makes him say one of the day's lines, read out once.
    await page.getByRole('button', { name: 'Parler à EpiDuck' }).click();
    await expect(said).not.toBeEmpty();

    // Named in the settings, he answers to it in the header.
    await page.goto('/settings');
    const name = page.getByLabel('Nom de ton canard');
    await name.fill('Gaston');
    await name.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Parler à Gaston' }),
    ).toBeVisible();

    // An accessory applies at once.
    const beanie = page.getByRole('button', { name: 'Bonnet' });
    await beanie.click();
    await expect(beanie).toHaveAttribute('aria-pressed', 'true');

    // Asleep, he stays asleep on the next page, until he is woken.
    await stored(page.getByRole('button', { name: 'Endormir Gaston' }));
    await page.goto('/parcours');
    const wake = page.getByRole('button', { name: 'Réveiller Gaston' });
    await expect(wake).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'Parler à Gaston' }),
    ).toHaveCount(0);
    await stored(wake);
    await expect(
      page.getByRole('button', { name: 'Parler à Gaston' }),
    ).toBeVisible();

    // Back as the fixture left him, for whoever runs next.
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Houppe' }).click();
    await expect(page.getByRole('button', { name: 'Houppe' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await name.fill('');
    await name.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Parler à EpiDuck' }),
    ).toBeVisible();
  });
});
