/**
 * What a talent's home suggests, as the talent reads it. The writes, the
 * refusals, and the order the hero picks in (`pickHomeHero`) have their own
 * suites; what only a browser can show is that each state of the hero reaches
 * the page, that a choice of subjects reads as a choice, that the calendar
 * file is one a phone can open, and that every link leaving Jump does so the
 * safe way: a new tab, no opener.
 */
import { test, expect, type Locator } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';
import { JUMP_LEVELS } from '../../src/lib/domain/xp';

async function expectLeavesSafely(link: Locator, href: string) {
  await expect(link).toHaveAttribute('href', href);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
}

test.describe('un talent dont l’événement a lieu aujourd’hui', () => {
  test.use({ storageState: storageStatePath(E2E.talentReady.email) });

  test('lit le message de son campus, et choisit entre les sujets du jour dans le bandeau', async ({
    page,
  }) => {
    await page.goto('/');

    // The campus's message stands on its own words: no label of the page's.
    const news = page.getByRole('region', { name: /Actualité/ });
    await expectLeavesSafely(
      news.getByRole('link', { name: 'le Discord du campus' }),
      E2E.homeNoteLink,
    );

    // The day's subjects hold the hero alone, as equal choices: one card and
    // one identical way in each, every one opening in a new tab. The camp the
    // campus points at waits for a day without them.
    const hero = page.getByRole('region', { name: 'En ce moment' });
    const choices = hero.getByRole('listitem');
    await expect(choices).toHaveCount(2);
    for (const [label, slug] of [
      [E2E.workshopLabel, E2E.workshopSlug],
      [E2E.secondWorkshopLabel, E2E.secondWorkshopSlug],
    ]) {
      const choice = choices.filter({
        has: page.getByRole('heading', { name: label, exact: true }),
      });
      await expect(
        choice.getByRole('button', { name: /Accéder au sujet/ }),
      ).toBeVisible();
      await expect(choice.locator('form')).toHaveAttribute(
        'action',
        `/activites/${slug}`,
      );
      await expect(choice.locator('form')).toHaveAttribute('target', '_blank');
    }
    await expect(page.getByText(E2E.highlightedEventName)).toHaveCount(0);
    // The card that used to hold the next session is gone (#501, AC11).
    await expect(page.getByText('Ta prochaine session')).toHaveCount(0);
  });

  test('retrouve son historique et ses activités à faire dans « Mon parcours », et plus sur l’accueil', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('Événements passés')).toHaveCount(0);
    // The home lists no subject below its hero: the pill counts what is left
    // and leads to the list.
    await expect(page.getByText('Mes activités')).toHaveCount(0);

    const parcours = page.getByRole('link', {
      name: /Mon parcours.*2 activités à faire/,
    });
    // The card carries the level Jump computes from the XP, whatever it is.
    await expect(
      parcours.getByText(new RegExp(`^(${JUMP_LEVELS.join('|')})$`)),
    ).toBeVisible();
    await parcours.click();
    await expect(page).toHaveURL(/\/parcours$/);
    await expect(
      page.getByRole('heading', { name: 'Mon parcours' }),
    ).toBeVisible();
    // Every activity offered sits under its event, with its way in (#445).
    const journey = page.getByRole('region', { name: 'Tes événements' });
    await expect(journey).toContainText(E2E.workshopLabel);
    await expect(
      journey.getByRole('button', {
        name: new RegExp(`${E2E.workshopLabel} \\(nouvel onglet\\)`),
      }),
    ).toBeVisible();
  });
});

test.describe('un talent inscrit à un événement à venir', () => {
  test.use({ storageState: storageStatePath(E2E.talentIdle.email) });

  test('lit qu’on l’attend, quel jour et à quelle heure, et met l’événement dans son agenda', async ({
    page,
  }) => {
    await page.goto('/');

    // Expected, never invited: the camp the campus points at is not offered
    // to a talent who already has an event to come.
    const hero = page.getByRole('region', { name: 'On a hâte de te voir' });
    await expect(hero).toContainText('Tu es inscrit');
    await expect(hero).toContainText('J-3');
    await expect(hero).toContainText(E2E.upcomingEventName);
    await expect(hero).toContainText('accueil à 14h00');
    await expect(page.getByRole('link', { name: /Je m’inscris/ })).toHaveCount(
      0,
    );

    // The calendar file is Jump's own, and one a phone opens as an event.
    const agenda = hero.getByRole('link', { name: /Ajouter à mon agenda/ });
    const href = await agenda.getAttribute('href');
    expect(href).toBe(`/agenda/${E2E.upcomingEventId}`);
    const file = await page.request.get(href!);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toContain('text/calendar');
    const body = await file.text();
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain(`SUMMARY:${E2E.upcomingEventName}`);
  });
});

test.describe('un talent sans rien à venir', () => {
  test.describe('sur un campus qui met un événement en avant', () => {
    test.use({ storageState: storageStatePath(E2E.talentInvited.email) });

    test('est invité à cet événement, vers son formulaire d’inscription', async ({
      page,
    }) => {
      await page.goto('/');
      const hero = page.getByRole('region', {
        name: E2E.highlightedEventName,
      });
      await expect(hero).toContainText('À ne pas manquer');
      await expectLeavesSafely(
        hero.getByRole('link', { name: /Je m’inscris/ }),
        E2E.highlightedSignupUrl,
      );
    });
  });

  test.describe('sur un campus qui invite toute l’année', () => {
    test.use({ storageState: storageStatePath(E2E.talentGeneric.email) });

    test('lit l’invitation générique de son campus', async ({ page }) => {
      await page.goto('/');
      const hero = page.getByRole('region', { name: E2E.homeInvitationTitle });
      await expectLeavesSafely(
        hero.getByRole('link', { name: /Je m’inscris/ }),
        E2E.homeInvitationUrl,
      );
    });
  });
});
