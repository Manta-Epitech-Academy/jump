import ejs from 'ejs';
import { withBrowser } from '../infra/browserPool';
import { epitechLogoSvg } from '../templates/epitechLogo';
import badgeTemplate from '../templates/badge.html?raw';

export type BadgeData = {
  prenom: string;
  nom: string;
  /** Image rights are a settled refusal -> show the "interdit" marker. */
  imageRefused: boolean;
};

/**
 * Print layout:
 * - `simple`: 8 single-sided landscape badges per A4 page.
 * - `foldable`: 4 per page, each printed twice (upright + 180°) so a fold down
 *   the middle yields a double-sided badge.
 */
export type BadgeMode = 'simple' | 'foldable';

/**
 * Renders a print-ready PDF of name badges on A4 portrait sheets with single
 * shared cut lines. The `mode` selects the simple or foldable layout.
 */
export async function generateBadgesPDF(
  badges: BadgeData[],
  mode: BadgeMode = 'simple',
): Promise<Uint8Array<ArrayBuffer>> {
  const htmlContent = await ejs.render(
    badgeTemplate,
    { data: { badges, mode, logoSvg: epitechLogoSvg } },
    { async: true },
  );

  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    try {
      await page.setContent(htmlContent, { waitUntil: 'load' });
      await page.evaluateHandle('document.fonts.ready');

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });

      return new Uint8Array(pdfBuffer) as Uint8Array<ArrayBuffer>;
    } finally {
      await page.close();
    }
  });
}
