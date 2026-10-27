/**
 * The Inscrits filters live in the page address (#442), and that is only true
 * through a real browser: the header funnel writes the querystring, the page
 * reads it back after a reload, the Back button walks the filtering history,
 * and the export posts exactly the rows left on screen. The matching rules
 * themselves are unit-tested (`roster.test.ts`); this checks the seam between
 * the controls, the router and the server.
 *
 * The fixture's roster: ROSTERUN (Seconde, femme), ROSTERDEUX (Seconde, homme),
 * ROSTERTROIS (Première, femme).
 */
import { test, expect, type Page } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

test.use({ storageState: storageStatePath(E2E.dev.email) });

const INSCRITS_URL = `/staff/dev/events/${E2E.rosterEventId}/inscrits`;

/** The names on the roster, in the order shown. */
async function shownNames(page: Page): Promise<string[]> {
  const rows = page.getByRole('row').filter({ hasText: 'ROSTER' });
  const names: string[] = [];
  for (const row of await rows.all()) {
    const text = await row.innerText();
    const name = E2E.rosterTalents.find((t) => text.includes(t.nom))?.nom;
    if (name) names.push(name);
  }
  return names.sort();
}

async function tick(page: Page, filter: RegExp | string, value: string) {
  const trigger =
    typeof filter === 'string'
      ? page.getByRole('button', { name: filter, exact: true })
      : page.getByRole('button', { name: filter });
  await trigger.click();
  await page.getByRole('option', { name: new RegExp(`^${value}`) }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

test.describe('les filtres des inscrits', () => {
  test("vivent dans l'adresse de la page", async ({ page }) => {
    await page.goto(INSCRITS_URL);
    await expect
      .poll(() => shownNames(page))
      .toEqual(['ROSTERDEUX', 'ROSTERTROIS', 'ROSTERUN']);

    await tick(page, 'Filtrer par niveau', 'Seconde');
    await expect(page).toHaveURL(/[?&]niveau=Seconde/);
    await expect
      .poll(() => shownNames(page))
      .toEqual(['ROSTERDEUX', 'ROSTERUN']);

    await tick(page, /^Genre/, 'Femme');
    await expect.poll(() => shownNames(page)).toEqual(['ROSTERUN']);
    await expect(
      page.getByRole('button', { name: 'Retirer le filtre Genre : Femme' }),
    ).toBeVisible();

    // A reload, or the link opened by a colleague, shows the same list.
    await page.reload();
    await expect.poll(() => shownNames(page)).toEqual(['ROSTERUN']);
    await expect(
      page.getByRole('button', { name: 'Retirer le filtre Niveau : Seconde' }),
    ).toBeVisible();

    // Back walks the filtering back one step.
    await page.goBack();
    await expect
      .poll(() => shownNames(page))
      .toEqual(['ROSTERDEUX', 'ROSTERUN']);

    // The export posts exactly the rows left on screen.
    const [exportRequest] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().endsWith('/inscrits/export') && r.method() === 'POST',
      ),
      page.getByRole('button', { name: 'Exporter (XLSX)' }).click(),
    ]);
    const posted = (exportRequest.postDataJSON() as { talentIds: string[] })
      .talentIds;
    expect([...posted].sort()).toEqual(
      ['e2e-talent-roster-1', 'e2e-talent-roster-2'].sort(),
    );

    await page
      .getByRole('button', { name: 'Retirer le filtre Niveau : Seconde' })
      .click();
    await expect
      .poll(() => shownNames(page))
      .toEqual(['ROSTERDEUX', 'ROSTERTROIS', 'ROSTERUN']);
    await expect(page).not.toHaveURL(/niveau=/);
  });
});
