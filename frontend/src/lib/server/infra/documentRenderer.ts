import type { Page } from 'puppeteer';
import { withBrowser } from './browserPool';

/**
 * HTML to a document, for everything Jump renders in a browser.
 *
 * Five generators used to repeat this block verbatim. It is shared for the usual
 * reason, and for one that is not cosmetic: **nothing rendered here executes, and
 * nothing rendered here fetches**, so no caller can render staff-authored HTML
 * with either switched on by forgetting to switch it off. Certificate designs are
 * authored at runtime and stored in the database (`Diploma_Template`), and this
 * function is the boundary that makes that safe to hand to Chrome.
 *
 * Those are two controls, not one stated twice, and the first is the one that
 * contains a script. Request interception does NOT cover WebSockets: no `request`
 * event fires for a `ws://` handshake, so a script that got as far as running
 * could still reach every internal service this pod reaches. Not running it is
 * what closes that; refusing requests is what keeps a document from depending on
 * anything outside its own bytes.
 *
 * Nothing here wants page JS in the first place: all five templates are static
 * print or screenshot output, and the QR codes arrive as data URIs their caller
 * already built. `page.evaluate` keeps working with it off, because CDP evaluates
 * out of band, so the font wait below is unaffected.
 *
 * It renders PDFs (what gets printed) and PNGs (what gets looked at). Both go
 * through the same page setup on purpose: a preview that took a different path
 * would be free to disagree with the document it is a preview of.
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
 * Everything else is aborted: a stored design that slipped a remote reference
 * past the sanitiser still resolves to nothing, so a document can only ever be
 * made of bytes we handed it.
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

/**
 * Open a page with nothing running and nothing reachable, load the HTML and wait
 * for the fonts. Everything both outputs must agree on lives here.
 */
async function withRenderedPage<T>(
  html: string,
  fontTimeoutMs: number,
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    try {
      // Before `setContent`, or a design's inline script runs while it parses.
      await page.setJavaScriptEnabled(false);
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
      return await fn(page);
    } finally {
      await page.close();
    }
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

  return withRenderedPage(html, fontTimeoutMs, async (page) => {
    const pdf = await page.pdf({
      ...size,
      printBackground: true,
      preferCSSPageSize: preferCssPageSize,
      margin: margin ?? ZERO_MARGIN,
      ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
    });
    return new Uint8Array(pdf) as Uint8Array<ArrayBuffer>;
  });
}

/**
 * The first page as a PNG, for a human or a model to look at.
 *
 * Same page setup as `renderPdf`, deliberately: this is what makes a preview
 * trustworthy rather than merely plausible. It is the answer to "what does this
 * document look like", and a model asked that question with only the source in
 * hand will otherwise render its own approximation and present it as the thing.
 */
export async function renderPng(input: {
  html: string;
  widthPx: number;
  heightPx: number;
  /** Downscale, to keep the encoded image small enough to travel. */
  scale?: number;
  fontTimeoutMs?: number;
}): Promise<Uint8Array<ArrayBuffer>> {
  const { html, widthPx, heightPx, scale = 1, fontTimeoutMs = 2000 } = input;

  return withRenderedPage(html, fontTimeoutMs, async (page) => {
    await page.setViewport({
      width: widthPx,
      height: heightPx,
      deviceScaleFactor: scale,
    });
    const png = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: widthPx, height: heightPx, scale },
    });
    return new Uint8Array(png) as Uint8Array<ArrayBuffer>;
  });
}
