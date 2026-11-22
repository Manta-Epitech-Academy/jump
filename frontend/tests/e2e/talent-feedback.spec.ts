/**
 * A talent answers an event's feedback form, and the answers are stored.
 *
 * The chat sends them through `submitFeedback`, a remote command, and no route
 * guard reaches one: this is the run that proves its gate admits a talent whose
 * app is open, and that what the talent wrote reaches the database. Talents are
 * the ones who write here, so it is driven through a real browser rather than
 * left to a unit test of the recorder.
 *
 * Stored is asserted the way the app itself knows it: the page's load sends a
 * talent who already answered back to the home, so a reload landing on `/` can
 * only mean the submission row exists.
 */
import { test, expect } from '@playwright/test';
import { prisma } from './fixtures/db';
import { E2E, storageStatePath } from './fixtures/identities';

test.use({ storageState: storageStatePath(E2E.talentReady.email) });

const FEEDBACK_URL = `/feedback/${E2E.eventId}/${E2E.feedbackFormSlug}`;

test.beforeEach(async () => {
  // A CI retry does not re-run the setup project, so attempt 2 would find the
  // answers attempt 1 stored and be sent home before seeing the form. Cleared
  // here rather than in the seed, which runs once per run.
  await prisma.feedback_Submission.deleteMany({
    where: { formId: E2E.feedbackFormId, talentId: E2E.talentReady.talentId },
  });
});

test('enregistre les réponses du talent au feedback', async ({ page }) => {
  await page.goto(FEEDBACK_URL);
  await expect(page.getByText("Qu'as-tu pensé de la journée ?")).toBeVisible();

  await page.getByPlaceholder('Ta réponse...').fill('Une très bonne journée.');
  const [response] = await Promise.all([
    page.waitForResponse((r) =>
      new URL(r.url()).pathname.endsWith('/submitFeedback'),
    ),
    page.getByRole('button', { name: 'Envoyer ma réponse' }).click(),
  ]);
  expect(response.ok()).toBeTruthy();

  await page.goto(FEEDBACK_URL);
  await expect(page).toHaveURL((url) => url.pathname === '/');
});
