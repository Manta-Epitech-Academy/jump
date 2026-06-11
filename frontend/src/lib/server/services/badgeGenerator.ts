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
 * Renders a print-ready PDF of name badges, four A6 badges per A4 sheet laid out
 * on a 2x2 grid with dashed cut guides. One A4 page is emitted per group of four
 * selected talents.
 */
export async function generateBadgesPDF(
  badges: BadgeData[],
): Promise<Uint8Array<ArrayBuffer>> {
  const htmlContent = await ejs.render(
    badgeTemplate,
    { data: { badges, logoSvg: epitechLogoSvg } },
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
