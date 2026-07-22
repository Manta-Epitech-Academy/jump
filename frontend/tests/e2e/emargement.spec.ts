import { test, expect } from '@playwright/test';

// The dev émargement surface is staff-only. An unauthenticated request must be
// redirected to the staff login by the route guard (hooks.server.ts). This is a
// thin, deterministic smoke test of that guard: no seeded data, no auth, and it
// does not depend on any specific event existing.
test.describe('Émargement access guard', () => {
  test('redirects an unauthenticated visitor to the staff login', async ({
    page,
  }) => {
    await page.goto('/staff/dev/events/nonexistent-event/emargement');
    await expect(page).toHaveURL(/\/staff\/login/);
  });
});
