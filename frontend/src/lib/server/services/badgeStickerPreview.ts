import { prisma } from '#lib/server/db.ts';
import { resolve } from '$app/paths';
import { badgeStickerSvg } from '#lib/domain/badges.ts';
import { UnknownScopeError } from '#lib/server/adminApi/scope.ts';
import { handleProvenanceFr } from '#lib/server/adminApi/handles.ts';
import { renderPng } from '#lib/server/infra/documentRenderer.ts';
import { fontFaceCss } from '#lib/server/templates/fonts.ts';

/**
 * What a badge's sticker looks like (#551), for the admin who had it drawn and
 * for the model that drew it: earned, as a talent who holds it sees it, and
 * still to earn, as everybody else does.
 *
 * Without it, a drawing written over the API is judged from its markup, and a
 * model asked how it looks renders its own approximation, the failure the
 * certificate preview was written against (`renderCertificatePreviewPng`). The
 * sticker is framed by `badgeStickerSvg`, the frame the collection draws, in
 * the two faces a drawing may use, and the two states are the collection's
 * own: a slight tilt and a shadow for an earned one, a 12 % silhouette for one
 * to earn. Those two looks are restated here in CSS because the page's classes
 * do not exist in a rendered document; `EpidexCard.svelte` says the same.
 */

/** CSS pixels a sticker is drawn at in the preview: twice the collection's 64. */
const STICKER_PX = 128;
const PAD_PX = 24;

function previewHtml(art: string): string {
  const sticker = badgeStickerSvg(art);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss('anton', 'spaceMono')}
html, body { margin: 0; background: #ffffff; }
.row { display: flex; gap: ${PAD_PX}px; padding: ${PAD_PX}px; }
.sticker { width: ${STICKER_PX}px; height: ${STICKER_PX}px; display: block; }
.sticker svg { width: 100%; height: 100%; display: block; }
.earned { transform: rotate(-4deg); filter: drop-shadow(0 4px 6px rgb(11 13 20 / 0.28)); }
.to-earn { filter: brightness(0) opacity(0.12); }
</style></head><body><div class="row"><span class="sticker earned">${sticker}</span><span class="sticker to-earn">${sticker}</span></div></body></html>`;
}

export async function renderBadgeStickerPreviewPng(art: string): Promise<{
  png: Uint8Array<ArrayBuffer>;
  widthPx: number;
  heightPx: number;
}> {
  const widthPx = 2 * STICKER_PX + 3 * PAD_PX;
  const heightPx = STICKER_PX + 2 * PAD_PX;
  const png = await renderPng({ html: previewHtml(art), widthPx, heightPx });
  return { png, widthPx, heightPx };
}

/**
 * Where a badge's preview can be seen, and the sentence that hands it over:
 * shared by the preview and by the write that stores a drawing, so the author
 * gets the link with the receipt. A sentence to quote, for the reason
 * `diplomaTemplatePreviewLink` gives: a model cannot tell whether its client
 * shows an inline image, so the link is handed over every time.
 */
export function badgeStickerPreviewLink(badge: {
  badgeKey: string;
  label: string;
  origin: string;
}): { url: string; apercu: string } {
  const url = `${badge.origin}${resolve('/api/admin/config/badge-preview')}?badgeKey=${encodeURIComponent(badge.badgeKey)}`;
  return {
    url,
    apercu: `Aperçu du badge « ${badge.label} » : ${url} (à gauche obtenu, à droite à obtenir, comme les talents le voient). Ouvrez ce lien pour voir le dessin.`,
  };
}

export async function getBadgeStickerPreview(params: {
  badgeKey: string;
  /** The answering instance's origin, as `getDiplomaTemplatePreview` takes it. */
  origin: string;
}): Promise<{
  badgeKey: string;
  label: string;
  image: { mimeType: string; base64: string };
  url: string;
  widthPx: number;
  heightPx: number;
  apercu: string;
}> {
  const badge = await prisma.badge_Definition.findUnique({
    where: { key: params.badgeKey },
    select: { key: true, label: true, art: true },
  });
  if (!badge) {
    throw new UnknownScopeError(
      `Badge introuvable : ${params.badgeKey}. ${handleProvenanceFr('badgeKey')}`,
    );
  }
  const { png, widthPx, heightPx } = await renderBadgeStickerPreviewPng(
    badge.art,
  );
  return {
    badgeKey: badge.key,
    label: badge.label,
    image: {
      mimeType: 'image/png',
      base64: Buffer.from(png).toString('base64'),
    },
    ...badgeStickerPreviewLink({
      badgeKey: badge.key,
      label: badge.label,
      origin: params.origin,
    }),
    widthPx,
    heightPx,
  };
}
