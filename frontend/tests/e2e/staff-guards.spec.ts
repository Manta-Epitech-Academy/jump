/**
 * The cross-space guard matrix.
 *
 * This is the security surface of the app - `applyRouteGuards` (called from
 * `hooks.server.ts`) is what stands between a recruitment-team account and the
 * admin space - and until now it had no automated coverage at all: the two specs
 * this file replaces only ever checked that an ANONYMOUS visitor gets bounced,
 * which every space does for free.
 *
 * Every assertion is a redirect, so they are cheap and they do not flake: no
 * seeded state beyond the accounts, no timing, no UI.
 */
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

test.describe("un membre de l'espace dev", () => {
  test.use({ storageState: storageStatePath(E2E.dev.email) });

  test('atteint son propre espace', async ({ page }) => {
    await page.goto('/staff/dev');
    await expect(page).toHaveURL((url) =>
      url.pathname.startsWith('/staff/dev'),
    );
  });

  test("est refoulé de l'espace admin", async ({ page }) => {
    await page.goto('/staff/admin');
    // Three hops, and the end state is the point. The admin sub-guard sends a
    // non-admin to `/staff/login` (it cannot assume the visitor has a space of
    // their own), the login load recognises the session and forwards them via
    // `getStaffRoleRedirectPath`, and the dev workspace lands on its first
    // reachable surface. Asserting the destination rather than the first hop is
    // what proves the bounce TERMINATES: a rule that sent them back to
    // `/staff/admin` would loop, and a login-page assertion would pass anyway.
    await expect(page).toHaveURL((url) =>
      url.pathname.startsWith('/staff/dev'),
    );
    expect(page.url()).not.toContain('/staff/admin');
  });
});

test.describe('un administrateur', () => {
  test.use({ storageState: storageStatePath(E2E.admin.email) });

  test('atteint son propre espace', async ({ page }) => {
    await page.goto('/staff/admin');
    await expect(page).toHaveURL((url) =>
      url.pathname.startsWith('/staff/admin'),
    );
  });

  test("est renvoyé vers l'espace admin depuis l'espace dev", async ({
    page,
  }) => {
    await page.goto('/staff/dev');
    // Not the login page: the dev sub-guard knows this role HAS a space, so
    // `getStaffRoleRedirectPath` sends them to it.
    await expect(page).toHaveURL((url) =>
      url.pathname.startsWith('/staff/admin'),
    );
  });
});

test.describe('un talent', () => {
  test.use({ storageState: storageStatePath(E2E.talentReady.email) });

  test("est renvoyé sur son tableau de bord depuis l'espace dev", async ({
    page,
  }) => {
    await page.goto('/staff/dev');
    await expect(page).toHaveURL((url) => url.pathname === '/');
  });
});

test.describe('un visiteur non authentifié', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('est envoyé au login staff, avec la page demandée en mémoire', async ({
    page,
  }) => {
    const target = `/staff/dev/events/${E2E.eventId}/emargement`;
    await page.goto(target);
    await expect(page).toHaveURL((url) => url.pathname === '/staff/login');
    // The `?redirect=` target is what replays the deep link after login, and it
    // is the half that a bare "am I bounced" assertion never covers.
    expect(new URL(page.url()).searchParams.get('redirect')).toBe(target);
  });

  test("est envoyé au login talent depuis l'espace talent", async ({
    page,
  }) => {
    await page.goto('/settings');
    // `/login`, not `/staff/login`: each space bounces to its own, and the
    // redirect cookie is scoped per audience so one cannot replay into the other.
    await expect(page).toHaveURL((url) => url.pathname === '/login');
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/settings');
  });
});
