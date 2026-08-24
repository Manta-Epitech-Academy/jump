import ejs from 'ejs';
import { renderPdf } from '../infra/pdfRenderer';
import { fontFaceCss } from '../templates/fonts';
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
    {
      data: {
        badges,
        mode,
        logoSvg: epitechLogoSvg,
        fontFaces: fontFaceCss('anton', 'plexSans'),
      },
    },
    { async: true },
  );

  return renderPdf({ html: htmlContent, page: { format: 'A4' } });
}
