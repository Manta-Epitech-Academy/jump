import ejs from 'ejs';
import { renderPdf, renderPng } from '../infra/documentRenderer';
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

async function buildBadgesHtml(
  badges: BadgeData[],
  mode: BadgeMode,
): Promise<string> {
  return ejs.render(
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
}

/**
 * Renders a print-ready PDF of name badges on A4 portrait sheets with single
 * shared cut lines. The `mode` selects the simple or foldable layout.
 */
export async function generateBadgesPDF(
  badges: BadgeData[],
  mode: BadgeMode = 'simple',
): Promise<Uint8Array<ArrayBuffer>> {
  return renderPdf({
    html: await buildBadgesHtml(badges, mode),
    page: { format: 'A4' },
  });
}

/** CSS pixels per millimetre, at the 96 dpi Chrome lays a page out in. */
const PX_PER_MM = 96 / 25.4;

/** Twice the CSS size, so the badge stays sharp on a high-density screen at
 *  the size a tooltip shows it. */
const PREVIEW_SCALE = 2;

/**
 * One badge as a PNG, cut from the first cell of a simple sheet: the same
 * template and the same render as the PDF, so the preview is the printed badge
 * and not a likeness of it. The cell's box is the template's own geometry (A4,
 * a 6mm margin, two 99mm columns, 63.25mm rows); a change to it there is a
 * change here.
 */
export async function renderBadgePreviewPng(badge: BadgeData): Promise<{
  png: Uint8Array<ArrayBuffer>;
  widthPx: number;
  heightPx: number;
}> {
  const mm = (v: number) => Math.round(v * PX_PER_MM);
  const cell = { x: mm(6), y: mm(6), width: mm(99), height: mm(63.25) };
  const png = await renderPng({
    html: await buildBadgesHtml([badge], 'simple'),
    widthPx: mm(210),
    heightPx: mm(297),
    scale: PREVIEW_SCALE,
    clip: cell,
  });
  return {
    png,
    widthPx: Math.round(cell.width * PREVIEW_SCALE),
    heightPx: Math.round(cell.height * PREVIEW_SCALE),
  };
}
