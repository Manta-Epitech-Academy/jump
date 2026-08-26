import { renderPdf } from '$lib/server/infra/documentRenderer';
import { fontFaceCss } from '$lib/server/templates/fonts';
import { epitechLogoSvg } from '$lib/server/templates/epitechLogo';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A4 landscape check-in sheet: branding + instructions on the left, a big
 * scannable QR on the right. Landscape suits a TV / projector (16:9) and keeps
 * the QR large. Printed once and displayed for the whole slot; the QR stays
 * valid until staff close the créneau.
 */
export async function generatePresenceQrPdf(data: {
  qrDataUrl: string;
  eventLabel: string;
  dayLabel: string;
  slotLabel: string;
}): Promise<Uint8Array<ArrayBuffer>> {
  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <style>
      ${fontFaceCss('plexSans')}
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        width: 1123px; height: 794px;
        font-family: 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif;
        color: #181818;
        display: flex; flex-direction: row; align-items: center; justify-content: center;
        gap: 72px; padding: 56px 80px;
      }
      .left { display: flex; flex-direction: column; align-items: flex-start; text-align: left; max-width: 460px; }
      .logo { width: 180px; margin-bottom: 40px; }
      .logo svg { width: 100%; height: auto; }
      .kicker { font-size: 22px; letter-spacing: 0.08em; text-transform: uppercase; color: #013afb; font-weight: 700; }
      .title { font-size: 44px; font-weight: 800; margin: 12px 0 4px; line-height: 1.1; }
      .slot { font-size: 26px; color: #444; }
      .instruction { font-size: 30px; font-weight: 700; margin-top: 44px; }
      .sub { font-size: 18px; color: #666; margin-top: 12px; }
      .qr { width: 600px; height: 600px; flex-shrink: 0; padding: 28px; border: 2px solid #eceef5; border-radius: 16px; }
      .qr img { width: 100%; height: 100%; image-rendering: pixelated; }
    </style>
  </head>
  <body>
    <div class="left">
      <div class="logo">${epitechLogoSvg}</div>
      <div class="kicker">Émargement</div>
      <div class="title">${escapeHtml(data.eventLabel)}</div>
      <div class="slot">${escapeHtml(data.dayLabel)} &middot; ${escapeHtml(data.slotLabel)}</div>
      <div class="instruction">Scanne ce QR code pour t'enregistrer</div>
      <div class="sub">Ouvre l'appareil photo de ton téléphone et vise le code. Connecte-toi à ton espace si on te le demande.</div>
    </div>
    <div class="qr"><img src="${data.qrDataUrl}" alt="QR code d'émargement" /></div>
  </body>
</html>`;

  return renderPdf({
    html,
    page: { width: '1123px', height: '794px', landscape: true },
  });
}
