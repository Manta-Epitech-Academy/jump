/**
 * The mutating end-to-end paths of the roster: a dev-team member marks a
 * talent present, and writes a note about one.
 *
 * Émargement is the surface AGENTS.md says must be a screen rather than an API
 * call - it is run on the floor, at 9am, on 200 students - so it is the write
 * worth driving through a real browser. One click crosses the route guard, the
 * campus scoping and the module gate (`getCampusId` / `loadEventOr404`),
 * superforms validation, the transaction that upserts the
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
import { test, expect, type Page } from '@playwright/test';
import { prisma } from './fixtures/db';
import { E2E, storageStatePath } from './fixtures/identities';

test.use({ storageState: storageStatePath(E2E.dev.email) });

const EMARGEMENT_URL = `/staff/dev/events/${E2E.eventId}/emargement`;

/**
 * The roster's own POST, not just the switch lighting up.
 *
 * `setStatus` writes an optimistic override BEFORE awaiting its `fetch`, so
 * `aria-pressed` flips instantly and anything that navigates right after a click
 * races the request: navigating cancels it, and the assertion then passed or
 * failed on whether the server had got there first. Awaiting the response is also
 * the stronger statement - the write was ACCEPTED, not just attempted.
 */
function waitForSetPresence(page: Page) {
  return page.waitForResponse(
    (r) => r.url().includes('setPresence') && r.request().method() === 'POST',
  );
}

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

    // Establish the starting state instead of assuming it. The fixture is seeded
    // once per run and this is the only spec that writes a presence, so nothing
    // puts the cell back: a CI retry (`retries: 2`) does not re-run the setup
    // project, so attempt 2 would open on the row attempt 1 already marked and die
    // on the line below rather than on whatever actually broke. Cleared through
    // the switch itself - clicking the active segment resets the cell - so the
    // `eventsCount` projection is recomputed by the app exactly as in production,
    // which a raw delete against the fixture's client would not do.
    if ((await present.getAttribute('aria-pressed')) === 'true') {
      await Promise.all([waitForSetPresence(page), present.click()]);
    }
    await expect(present).toHaveAttribute('aria-pressed', 'false');

    const [response] = await Promise.all([
      waitForSetPresence(page),
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

  test('écrit une note, et relit à la réouverture celle d’un autre', async ({
    page,
  }) => {
    // The notes are remote functions: the dialog reads `talentNotes`, the
    // composer calls `createTalentNote`, and neither meets the route guard, so
    // this is the run that proves the dev gate admits the team member it should
    // and that a query's answer reaches the screen. Unique per run, since a CI
    // retry reopens on the notes the previous attempt wrote.
    const stamp = Date.now();
    const mine = `Note E2E ${stamp}`;
    const theirs = `Note E2E d'un collègue ${stamp}`;
    await page.goto(EMARGEMENT_URL);
    const notesOf = page.getByRole('button', {
      name: `Notes de ${E2E.talentReady.prenom} ${E2E.talentReady.nom}`,
    });

    await notesOf.first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Ajouter une note' }).click();
    await dialog.getByRole('textbox').fill(mine);
    await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(dialog.getByText(mine)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Another member of staff writes a note while the dialog is closed. Kit
    // keeps the first answer until it is garbage collected, which the write
    // above refreshed and this one did not, so the reopened dialog shows it at
    // once: the note written since has to come from asking again, and reach
    // the feed on screen rather than stop at the query.
    await prisma.note_TalentNote.create({
      data: { talentId: E2E.talentReady.talentId, body: theirs },
    });

    await notesOf.first().click();
    const reopened = page.getByRole('dialog');
    await expect(reopened.getByText(theirs)).toBeVisible();
    await expect(reopened.getByText(mine)).toBeVisible();
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
