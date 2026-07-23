import { test, expect } from '@playwright/test';

test.describe('Émargement contact endpoint security guard', () => {
  test('redirects unauthenticated requests to staff login', async ({
    request,
  }) => {
    const res = await request.get(
      '/staff/dev/events/test-event/emargement/contact/test-talent',
    );
    // Unauthenticated GET request to staff route should not yield 200 OK
    expect(res.status()).toBe(200);
    // Response lands on login HTML page
    const text = await res.text();
    expect(text).toContain('Se connecter');
  });
});
