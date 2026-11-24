/**
 * A guardian signing for one of two children on the same page.
 *
 * The form is one component per child, each a superform under its own id, and
 * what only a browser shows is that a signature lands on the form it was sent
 * from: the page announces the child just signed for, that child's form goes,
 * and the sibling's stays to be signed. The image-rights page then opens with no
 * decision chosen, which is what keeps a consent from being pre-ticked.
 */
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

const [alix, noa] = E2E.parentSigning.children;
const name = (c: { prenom: string; nom: string }) => `${c.prenom} ${c.nom}`;

test.use({ storageState: storageStatePath(E2E.parentSigning.email) });

test('un responsable légal signe pour chacun de ses deux enfants', async ({
  page,
}) => {
  await page.goto('/parent/reglement');
  const formOf = (c: { prenom: string; nom: string }) =>
    page.locator('form', { hasText: name(c) });

  // Pre-filled from the guardian the talent named, the acceptance left to them.
  const first = formOf(alix);
  await expect(first.getByPlaceholder('Prénom')).toHaveValue('Anne');
  await expect(first.getByText('mère', { exact: true })).toBeVisible();
  await first.getByPlaceholder('Ville').fill('Lille');
  const sign = first.getByRole('button', { name: 'Signer le règlement' });
  await expect(sign).toBeDisabled();
  await first.getByRole('checkbox').click();
  await sign.click();

  await expect(
    page.getByText(
      `Le règlement intérieur pour ${name(alix)} a été signé avec succès.`,
    ),
  ).toBeVisible();
  await expect(formOf(alix)).toHaveCount(0);
  await expect(formOf(noa)).toHaveCount(1);

  // The last child signed, the flow moves on to the image rights.
  await formOf(noa).getByPlaceholder('Ville').fill('Lille');
  await formOf(noa).getByRole('checkbox').click();
  await formOf(noa)
    .getByRole('button', { name: 'Signer le règlement' })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === '/parent/signature');

  const decision = formOf(alix);
  await decision.getByPlaceholder('Ville').fill('Lille');
  await expect(
    decision.getByRole('button', { name: "Signer l'autorisation" }),
  ).toBeDisabled();
  await decision
    .getByRole('button', { name: "Je refuse l'utilisation de l'image" })
    .click();
  await decision.getByRole('button', { name: 'Enregistrer mon refus' }).click();
  await expect(
    page.getByText(`Le refus pour ${name(alix)} a bien été enregistré.`),
  ).toBeVisible();
  await expect(formOf(noa)).toHaveCount(1);
});
