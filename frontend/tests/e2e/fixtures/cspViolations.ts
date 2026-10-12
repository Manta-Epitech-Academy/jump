/**
 * What the browser refused on a page, read from its own events.
 *
 * Real `securitypolicyviolation` events rather than console text. Console
 * scraping was the first attempt and it was wrong twice over: DevTools emits
 * advisories that mention "Content Security Policy" without anything having
 * broken, and a genuine refusal is easier to classify from the event's own
 * `blockedURI` than from a translated sentence.
 *
 * A refused script fails silently, which is why this exists: the page still
 * paints whatever did not need it, so nothing on screen says what is missing.
 */
import type { Page } from '@playwright/test';

export type Violation = {
  directive: string;
  blockedURI: string;
  sourceFile: string;
};

/**
 * Starts recording before the next navigation, and returns the reader. Read it
 * once the page has done what the spec waits for: a lazily imported bundle
 * runs after the load event, so "loaded" is not the moment to look.
 */
export async function watchViolations(
  page: Page,
): Promise<() => Promise<Violation[]>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: unknown[] };
    w.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__violations.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blockedURI: e.blockedURI,
        sourceFile: e.sourceFile,
      });
    });
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __violations: Violation[] }).__violations,
    );
}
