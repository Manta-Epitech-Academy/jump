/**
 * Minting a curated-admin-API token, end to end.
 *
 * This flow had no automated coverage of any kind, which is how it broke in
 * production and stayed broken: an admin filled the form, the toast said the
 * token was created, the row was in the database, and the secret never painted.
 * A secret is shown exactly once, so every attempt burned a token nobody could
 * ever use.
 *
 * The assertion that would have caught it is the one below: after a submit, the
 * secret is ON SCREEN. Everything else here guards the affordances built around
 * that, because the value cannot be fetched again: the creation form steps aside
 * until the secret is acknowledged, and the command handed over carries the
 * token already substituted.
 *
 * No `data-testid`: the page renders real French labels and real buttons, which
 * is what an admin sees and therefore what this spec looks for.
 */
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

const PAGE = '/staff/admin/api-tokens';

/** What `mintToken` produces: `jump_` + base64url. */
const SECRET = /jump_[A-Za-z0-9_-]{20,}/;

test.describe("l'accès API", () => {
  test.use({ storageState: storageStatePath(E2E.admin.email) });

  test('affiche le secret une fois, puis le laisse partir sur acquittement', async ({
    page,
  }) => {
    const label = `E2E ${Date.now()}`;
    await page.goto(PAGE);

    await page.getByLabel('Nom du token').fill(label);
    await page
      .getByRole('checkbox', { name: /conditions d'utilisation/i })
      .check();

    // The creation is a real POST, and the reveal is rendered from its response.
    // Awaiting the response rather than the paint is what keeps this off a
    // timing race.
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/staff/admin/api-tokens') &&
          response.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Créer un token' }).click(),
    ]);

    // THE assertion. It is shown once and never again, so if it is not here it
    // is nowhere.
    const secret = page.getByText(SECRET).first();
    await expect(secret).toBeVisible();
    const value = ((await secret.textContent()) ?? '').trim();
    expect(value).toMatch(SECRET);

    // The command is the reason the secret is readable at all rather than merely
    // present: it carries the token, so nobody has to retype it.
    const command = page.getByText(/^claude mcp add /);
    await expect(command).toBeVisible();
    await expect(command).toContainText(value);
    await expect(command).toContainText('--transport http');

    // Nothing else is on screen over a secret that has not been acknowledged,
    // and the inventory is the load-bearing half of that. Its revoke form posts
    // to this same route, so applying that action's result would replace the
    // `form` prop this panel reads and take the secret with it.
    await expect(
      page.getByRole('button', { name: 'Créer un token' }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Révoquer' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Tokens/ })).toHaveCount(0);

    await page.getByRole('button', { name: "J'ai copié le token" }).click();

    // Acknowledging is what drops it, and it never comes back.
    await expect(page.getByText(SECRET)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Créer un token' }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText(SECRET)).toHaveCount(0);

    // The inventory comes back with it, and any admin can cut it from there.
    const row = page.getByRole('listitem').filter({ hasText: label });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Révoquer' }).click();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('revoke') &&
          response.request().method() === 'POST',
      ),
      page
        .getByRole('button', { name: 'Révoquer', exact: true })
        .last()
        .click(),
    ]);
    await expect(
      page.getByRole('listitem').filter({ hasText: label }),
    ).toContainText('révoqué');
  });

  test("donne la commande de connexion avant même qu'un token existe", async ({
    page,
  }) => {
    await page.goto(PAGE);

    // The standing section is what somebody reads to know what they are about to
    // be handed. It names this environment, never a documented example host.
    const command = page.getByText(/^claude mcp add /);
    await expect(command).toBeVisible();
    await expect(command).toContainText(
      `${new URL(page.url()).origin}/api/mcp`,
    );
    await expect(command).toContainText('votre-token');

    // Re-adding under a name that already exists fails, and re-minting a token
    // is exactly when somebody runs the add command a second time.
    await page.getByText('Jump est déjà configuré sur ce poste').click();
    await expect(page.getByText('claude mcp remove jump-admin')).toBeVisible();
  });

  test("n'est pas atteignable par un membre de l'espace dev", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: storageStatePath(E2E.dev.email),
    });
    const devPage = await context.newPage();
    await devPage.goto(PAGE);
    await expect(devPage).toHaveURL((url) => !url.pathname.startsWith(PAGE));
    await context.close();
  });
});
