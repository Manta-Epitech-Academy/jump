import type { Page } from 'puppeteer';
import { withBrowser } from './browserPool';

/**
 * HTML to PDF, for every document Jump prints.
 *
 * Five generators used to repeat this block verbatim. It is shared for the usual
 * reason, and for one that is not cosmetic: **the network is blocked here**, so
 * no caller can render staff-authored HTML with it switched on by forgetting to
 * switch it off. Certificate designs are authored at runtime and stored in the
 * database (`Diploma_Template`), and this function is the boundary that makes
 * that safe to hand to Chrome.
 *
 * Blocking the network also removed a workaround rather than accommodating it.
 * The certificate generator used to parse on `domcontentloaded` and race
 * `document.fonts.ready` against a 2s timer, because waiting for `load` while
 * Google Fonts was unreachable once stalled a 200-page render into Puppeteer's
 * 30s timeout. Nothing remote is fetched now (fonts carry their own bytes, see
 * `templates/fonts.ts`), so `load` is safe again for everyone.
 */

/** Page geometry: explicit pixels, or a named paper size. */
export type PdfPageSize =
  | { width: string; height: string; landscape?: boolean }
  | { format: 'A4'; landscape?: boolean };

const ZERO_MARGIN = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
} as const;

/**
 * Only a `data:` URI, or the blank document `setContent` writes into, may load.
 * Everything else is aborted, which is the whole control: a stored design that
 * slipped a remote reference past the sanitiser still cannot reach the network,
 * and this pod can reach the database and every internal service.
 *
 * Aborting rather than allowing-and-ignoring matters for latency too: a blocked
 * request fails immediately, so `load` and `document.fonts.ready` both settle
 * instead of waiting out a timeout.
 */
const ALLOWED_SCHEME = /^(data:|about:|blob:)/i;

async function blockNetwork(page: Page): Promise<void> {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (ALLOWED_SCHEME.test(request.url())) {
      void request.continue().catch(() => {});
      return;
    }
    // Swallow the rejection: a request already handled (or a page torn down
    // mid-flight) throws here, and neither is a reason to fail the render.
    void request.abort().catch(() => {});
  });
}

export async function renderPdf(input: {
  html: string;
  page: PdfPageSize;
  /**
   * Print margins. Defaults to none, because all but one template paint their
   * own frame edge to edge.
   */
  margin?: { top: string; right: string; bottom: string; left: string };
  /**
   * Let the document's own `@page` rule win over `page`. Default true; the
   * onboarding document is the exception, it wants Puppeteer's margin box.
   */
  preferCssPageSize?: boolean;
  /**
   * Budget for the print pass. Defaults to Puppeteer's own 30s; a cohort sheet
   * can run to ~200 pages and needs far more on a constrained pod CPU.
   */
  timeoutMs?: number;
  /**
   * Budget for webfonts to become ready. Fonts are inline data URIs, so this is
   * not about the network any more: it bounds a *stored* design's own
   * `@font-face`, which nobody here reviewed.
   */
  fontTimeoutMs?: number;
}): Promise<Uint8Array<ArrayBuffer>> {
  const {
    html,
    page: size,
    margin,
    preferCssPageSize = true,
    timeoutMs,
    fontTimeoutMs = 2000,
  } = input;

  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    try {
      await blockNetwork(page);
      await page.setContent(html, { waitUntil: 'load' });

      await page.evaluate(
        (budget) =>
          Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, budget)),
          ]),
        fontTimeoutMs,
      );

      const pdf = await page.pdf({
        ...size,
        printBackground: true,
        preferCSSPageSize: preferCssPageSize,
        margin: margin ?? ZERO_MARGIN,
        ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
      });

      return new Uint8Array(pdf) as Uint8Array<ArrayBuffer>;
    } finally {
      await page.close();
    }
  });
}
