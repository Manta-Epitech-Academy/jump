import { test, expect } from '@playwright/test'

// TODO: Replace this placeholder with real E2E tests.
// E2E tests require the app and Supabase (test instance) to be running.
// See TESTING.md for conventions and examples.

test('placeholder - app is reachable', async ({ page }) => {
  await page.goto('/')
  await expect(page).not.toHaveURL('about:blank')
})
