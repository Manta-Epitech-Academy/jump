/**
 * The beat the whole feature is built around, and the only place it can be
 * asserted: the talent is on another tab while the XP arrive.
 *
 * Everything else about the activities is covered without a browser. The scale
 * is a pure function, the ticket has its own round trip, and the callback has an
 * integration suite that drives the route. What none of them can see is that the
 * page ALREADY MOUNTED when the reward appears: the talent walks the activity in
 * a second tab, comes back, the dashboard revalidates, and only then does `data`
 * carry something to celebrate. A celebration wired to mount does nothing there,
 * silently, which is exactly what shipped and what this spec exists to catch.
 */
import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

const SECRET = process.env.WORKSHOP_TICKET_SECRET ?? '';

/** The plugin's contract, in the two lines this spec needs. */
function signedCallback(body: string): Record<string, string> {
  const callbackKey = createHmac('sha256', SECRET)
    .update('jump/callback')
    .digest('hex');
  const ts = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-timestamp': ts,
    'x-signature':
      'sha256=' +
      createHmac('sha256', callbackKey).update(`${ts}.${body}`).digest('hex'),
  };
}

test.describe('un talent inscrit à un événement qui propose une activité', () => {
  test.use({ storageState: storageStatePath(E2E.talentReady.email) });

  test('voit la mission, puis ses XP au retour sur l’onglet', async ({
    page,
    request,
  }) => {
    expect(
      SECRET,
      'WORKSHOP_TICKET_SECRET must be set: it is declared in frontend/.env.test.defaults, which `bun run test:e2e` sources',
    ).not.toBe('');

    await page.goto('/');
    const mission = page.locator('form[action^="/activites/"]');
    await expect(mission).toBeVisible();
    // A new tab, which is what leaves this one alive to come back to.
    await expect(mission).toHaveAttribute('target', '_blank');
    await expect(mission).toContainText(E2E.workshopLabel);

    // The talent enters. Done over the action rather than by writing the row, so
    // what pins the event, the campus and the minute budget is the code that
    // will pin them in production.
    const entry = await request.post(`/activites/${E2E.workshopSlug}`, {
      // Form-encoded and empty, which is what the submit above sends: a kit
      // action refuses anything else with a 415 before it runs. The Origin is
      // what a browser sends too, and kit's own CSRF check answers 403 without
      // it, which is the right refusal and not the one under test here.
      form: {},
      headers: {
        origin: new URL(page.url()).origin,
        // A document request, like the submit. Without it kit negotiates the
        // action down its JSON branch and answers 200 with the redirect in the
        // body, which would assert the wrong half of the contract.
        accept: 'text/html',
      },
      maxRedirects: 0,
    });
    expect(entry.status()).toBe(303);
    expect(entry.headers()['location']).toContain('/jump/enter?t=');

    // CTFd reports half the steps. Nothing on this page witnesses it: the
    // dashboard is already open and nothing reloads it.
    const body = JSON.stringify({
      instanceSlug: E2E.workshopSlug,
      talentId: E2E.talentReady.talentId,
      solvedSteps: 5,
      totalSteps: 10,
      isComplete: false,
    });
    const callback = await request.post('/api/workshops/callback', {
      headers: signedCallback(body),
      data: body,
    });
    expect(callback.status()).toBe(200);

    // Coming back to the tab is the trigger, and the only one.
    await page.evaluate(() =>
      document.dispatchEvent(new Event('visibilitychange')),
    );

    // Half of a sixty-minute activity, at ten XP the minute. Asserted on the
    // toast rather than on the float: the float counts its number up over 900 ms
    // and hides at 2500, so its text exists for a moment, while the toast carries
    // the amount as one string for six seconds.
    const toast = page.getByText('Tu gagnes +300 XP', { exact: false });
    await expect(toast).toBeVisible();
    await expect(page.getByText('Activité en cours')).toBeVisible();
    await expect(mission).toContainText('5 / 10 étapes validées');

    // And it is owed once. A second return celebrates nothing, because the
    // acknowledgement went out with the first.
    await page.reload();
    await expect(mission).toContainText('5 / 10 étapes validées');
    await page.evaluate(() =>
      document.dispatchEvent(new Event('visibilitychange')),
    );
    await expect(
      page.getByText('Tu gagnes +300 XP', { exact: false }),
    ).toHaveCount(0);
  });
});
