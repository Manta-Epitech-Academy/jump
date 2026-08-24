/**
 * The Epitech-branded email shell: logo header, white card, footer. Every
 * transactional and broadcast mail Jump sends wraps its content in this,
 * so a recipient never sees two different-looking Jump emails.
 *
 * Colors are the same tokens `DESIGN.md` names `epiBlue` / `epiTech`, kept
 * as hex here because inline styles are the only thing an email client
 * reliably renders (no custom properties, no linked stylesheet).
 */

/** `DESIGN.md`'s `epiBlue`: brand primary, AA on white. Borders, links, CTAs. */
export const EPI_BLUE = '#013afb';
/** `DESIGN.md`'s `epiTech`: the jungle accent. Fills only, never text on light. */
export const EPI_TECH = '#00ff97';

export const BRAND_FONT_FAMILY = `'Helvetica Neue', Helvetica, Arial, sans-serif`;

/** Neutral scale shared by every block inside the shell, so a table or a
 * list built outside the markdown renderer still reads as one system. */
export const INK = '#1e293b';
export const SUBTLE = '#64748b';
export const MUTED = '#475569';
export const BORDER = '#e2e8f0';
export const PAGE_BG = '#f1f5f9';
export const PANEL_BG = '#f8fafc';

const DEFAULT_LOGO_PATH = '/email/epitech-logo.png';

/** Opens the branded card: page background, white card, logo header. Pair with {@link shellClose}. */
export function shellOpen(baseUrl: string): string {
  const logoSrc = `${baseUrl}${DEFAULT_LOGO_PATH}`;
  return [
    `<div style="background-color: ${PAGE_BG}; padding: 40px 20px; font-family: ${BRAND_FONT_FAMILY}; color: ${INK}; text-align: center;">`,
    `<div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-top: 6px solid ${EPI_BLUE}; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: left;">`,
    `<div style="padding: 32px 32px 0;">`,
    `<img src="${logoSrc}" alt="Epitech" width="140" style="display: block; height: auto; max-width: 140px; border: 0;" />`,
    `</div>`,
    `<div style="padding: 24px 32px 32px;">`,
  ].join('');
}

/** Closes the branded card opened by {@link shellOpen}: Epitech footer + closing tags. */
export function shellClose(): string {
  const year = new Date().getFullYear();
  return [
    `</div>`,
    `<div style="border-top: 1px solid ${BORDER}; padding: 20px 32px; background-color: ${PANEL_BG};">`,
    `<p style="margin: 0; font-size: 11px; line-height: 1.6; color: ${SUBTLE}; text-align: center;">`,
    `Epitech &middot; L'&eacute;cole de l'innovation et de l'expertise informatique.<br />`,
    `&copy; ${year} Epitech &mdash; Groupe IONIS. Tous droits r&eacute;serv&eacute;s.`,
    `</p>`,
    `</div>`,
    `</div>`,
    `</div>`,
  ].join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Wraps a branded shell fragment (open + content + close) into a complete
 * HTML document. Shipped as the HTML part of an email, a bare `<div>` with
 * no `<html>`/`<body>` scores SpamAssassin's HTML_MIME_NO_HTML_TAG and reads
 * to Gmail/Outlook as a tell of auto-generated spam. Every server send path
 * must go through this; an in-app preview injecting the fragment via
 * `{@html}` should keep the bare shell instead, since a full document would
 * nest `<html>`/`<body>` inside the live DOM.
 */
export function wrapEmailDocument(shellHtml: string, subject = ''): string {
  const title = subject ? `<title>${escapeHtml(subject)}</title>` : '';
  return [
    '<!DOCTYPE html>',
    '<html lang="fr">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />',
    title,
    '</head>',
    `<body style="margin: 0; padding: 0; background-color: ${PAGE_BG};">`,
    shellHtml,
    '</body>',
    '</html>',
  ].join('');
}
