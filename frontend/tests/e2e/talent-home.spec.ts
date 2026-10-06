/**
 * What a campus puts on its talents' home, as the talent reads it. The writes,
 * the refusals and the rule that hides a passed highlight have their own
 * integration suite; what only a browser can show is that both blocks reach the
 * page, and that their links leave Jump the safe way: a new tab, no opener.
 */
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

test.describe('un talent dont le campus a rempli son accueil', () => {
  test.use({ storageState: storageStatePath(E2E.talentReady.email) });

  test('lit le mot du campus et peut s’inscrire à l’événement mis en avant', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByText('Le mot du campus')).toBeVisible();
    const noteLink = page.getByRole('link', { name: 'le Discord du campus' });
    await expect(noteLink).toHaveAttribute('href', E2E.homeNoteLink);
    await expect(noteLink).toHaveAttribute('target', '_blank');
    await expect(noteLink).toHaveAttribute('rel', /noopener/);

    const highlight = page.getByRole('region', {
      name: E2E.homeHighlightTitle,
    });
    await expect(highlight).toBeVisible();
    const signUp = highlight.getByRole('link', { name: /Je m’inscris/ });
    await expect(signUp).toHaveAttribute('href', E2E.homeHighlightUrl);
    await expect(signUp).toHaveAttribute('target', '_blank');
    await expect(signUp).toHaveAttribute('rel', /noopener/);
  });
});
