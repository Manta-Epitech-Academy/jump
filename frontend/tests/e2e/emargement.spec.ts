/**
 * The one mutating end-to-end path: a dev-team member marks a talent present.
 *
 * Émargement is the surface AGENTS.md says must be a screen rather than an API
 * call - it is run on the floor, at 9am, on 200 students - so it is the write
 * worth driving through a real browser. One click crosses the route guard, the
 * campus scoping (`getCampusId` / `loadEventOr404`), the module gate
 * (`requireEventModule`), superforms validation, the transaction that upserts the
 * `EventPresence` row, and the `eventsCount` projection recomputed alongside it.
 * A unit test can reach any one of those; only this reaches the seam between all
 * of them.
 *
 * No `data-testid` anywhere: `PresenceSwitch` renders real buttons with visible
 * French labels and `aria-pressed`, which is what a staff member sees and
 * therefore what the spec should look for. `SortableTable` renders ONE layout
 * (desktop table or mobile cards, never both), so at the desktop viewport each
 * roster row carries exactly one switch.
 */
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

test.use({ storageState: storageStatePath(E2E.dev.email) });

const EMARGEMENT_URL = `/staff/dev/events/${E2E.eventId}/emargement`;

test.describe("l'émargement", () => {
  test('enregistre une présence qui survit à un rechargement', async ({
    page,
  }) => {
    await page.goto(EMARGEMENT_URL);

    // The roster row of the seeded talent. Scoped by name rather than by index:
    // a second fixture talent would silently shift a positional selector.
    const row = page.getByRole('row').filter({ hasText: E2E.talentReady.nom });
    await expect(row).toHaveCount(1);

    const present = row.getByRole('button', { name: 'Présent', exact: true });
    await expect(present).toHaveAttribute('aria-pressed', 'false');

    // Wait for the action's own response, not just for the switch to light up.
    // The roster writes an optimistic override BEFORE awaiting its `fetch`, so
    // `aria-pressed` flips instantly and a reload right after it races the POST:
    // navigating cancels the in-flight request, and the test then failed or
    // passed depending on whether the server had got there first. Asserting the
    // response is also the stronger statement - the write was ACCEPTED, not just
    // attempted.
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('setPresence') && r.request().method() === 'POST',
      ),
      present.click(),
    ]);
    expect(response.ok()).toBeTruthy();
    await expect(present).toHaveAttribute('aria-pressed', 'true');

    // And this is what makes it a write test rather than a click test: the state
    // has to come back from the database, not from the optimistic override.
    await page.reload();
    const afterReload = page
      .getByRole('row')
      .filter({ hasText: E2E.talentReady.nom })
      .getByRole('button', { name: 'Présent', exact: true });
    await expect(afterReload).toHaveAttribute('aria-pressed', 'true');
  });

  test("refuse l'accès à un administrateur", async ({ browser }) => {
    // The other half of the same write: `requireStaffGroup(locals, 'devMember')`
    // guards the action, and an admin is not a dev member. Asserted from a
    // separate context so this file's dev session is untouched.
    const context = await browser.newContext({
      storageState: storageStatePath(E2E.admin.email),
    });
    const adminPage = await context.newPage();
    await adminPage.goto(EMARGEMENT_URL);
    await expect(adminPage).toHaveURL((url) =>
      url.pathname.startsWith('/staff/admin'),
    );
    await context.close();
  });
});
