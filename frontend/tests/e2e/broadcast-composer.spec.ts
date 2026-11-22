/**
 * The broadcast composer's live preview of who a send would reach.
 *
 * It is what an admin reads before an irreversible send, and it is a remote
 * query (`recipientsPreview`), so no route guard reaches it: this is the run
 * that proves its admin gate lets an admin through and that the roster on
 * screen answers the targeting on screen. Retargeting from one campus to the
 * other is the case a late answer used to get wrong, so the spec drives exactly
 * that and expects the first campus's talent gone.
 *
 * Nothing is sent: the spec never picks a template or writes a message, which
 * is what the send button waits for.
 */
import { test, expect, type Page } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

test.use({ storageState: storageStatePath(E2E.admin.email) });

/** Picks a campus in the composer's campus select. */
async function pickCampus(page: Page, current: string, name: string) {
  await page.getByRole('combobox').filter({ hasText: current }).click();
  await page.getByRole('option', { name, exact: true }).click();
}

test("l'aperçu des destinataires suit le dernier ciblage", async ({ page }) => {
  await page.goto('/staff/admin/broadcasts/new');
  const recipients = page
    .getByRole('heading', { name: 'Destinataires' })
    .locator('xpath=ancestor::div[contains(@class, "border")][1]');
  await expect(recipients).toContainText('Choisis un campus et une audience');

  await pickCampus(page, '- Sélectionner -', 'E2E Campus');
  await page.getByRole('radio', { name: 'Talents' }).click();
  await expect(recipients).toContainText('recevront ce message');
  await expect(recipients).toContainText(E2E.talentReady.nom);

  await pickCampus(page, 'E2E Campus', 'E2E Campus Ateliers');
  await expect(recipients).toContainText(E2E.talentGeneric.nom);
  await expect(recipients).not.toContainText(E2E.talentReady.nom);
});
