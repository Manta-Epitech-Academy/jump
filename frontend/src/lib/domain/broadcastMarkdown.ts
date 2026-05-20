/**
 * Markdown → HTML pipeline for broadcast mails.
 *
 * Templates store **markdown** in `MessageTemplate.body`. At send time (and
 * for live preview), we render that markdown into the Epitech-branded email
 * shell — same teal top bar + centered white card as relance mails — with
 * inline styles so it survives email clients that strip <style> tags.
 *
 * Custom shortcode for buttons: `:button[Label](https://example.com)` on
 * its own line renders as a centered blue CTA button matching the relance
 * design. Marked extension below.
 *
 * Isomorphic: usable in client (template preview) and server (send).
 */

import { Marked, type Tokens } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

interface BroadcastButtonToken extends Tokens.Generic {
  type: 'broadcastButton';
  raw: string;
  href: string;
  label: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * URLs allowed in `<a href>` after markdown rendering. `javascript:`,
 * `data:`, `vbscript:` are blocked — even though most email clients strip
 * scripts, the same rendered HTML powers in-app previews (compose dialog,
 * dev broadcast detail) where a script execution context exists.
 *
 * Rejected URLs render as `about:blank` so the link is visibly inert
 * instead of dangerous-but-clickable.
 */
function sanitizeHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Block any control characters that could break out of the href attr.
  if (/[\x00-\x1f]/.test(trimmed)) return 'about:blank';
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return 'about:blank';
  }
  return trimmed;
}

// `[^)\n]*` (not `+`) so the tokenizer still claims `:button[…]()` when the
// URL variable hasn't been substituted yet — otherwise marked falls back to
// inline link parsing and the `:button` prefix leaks into the rendered HTML
// as literal text (`:buttonLabel` artefact). The renderer below handles the
// empty-href case explicitly.
const BUTTON_RE = /^:button\[([^\]\n]+)\]\(([^)\n]*)\)\s*(?:\n|$)/;

const broadcastButton = {
  name: 'broadcastButton',
  level: 'block' as const,
  start(src: string): number | undefined {
    const m = src.match(/^:button\[/m);
    return m?.index;
  },
  tokenizer(src: string): BroadcastButtonToken | undefined {
    const match = BUTTON_RE.exec(src);
    if (!match) return undefined;
    return {
      type: 'broadcastButton',
      raw: match[0],
      label: match[1].trim(),
      href: match[2].trim(),
    };
  },
  renderer(token: Tokens.Generic): string {
    const t = token as BroadcastButtonToken;
    const label = escapeHtml(t.label);
    if (!t.href) {
      // Missing URL (e.g. unresolved variable). Render a disabled-looking
      // pill so the broadcast still reaches the recipient with a visible
      // placeholder instead of broken `:buttonLabel` text.
      return `<div style="text-align: center; margin: 28px 0 30px;"><span style="display: inline-block; background-color: #cbd5e1; color: #ffffff; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 12px;">${label}</span></div>\n`;
    }
    const href = escapeHtml(sanitizeHref(t.href));
    return `<div style="text-align: center; margin: 28px 0 30px;"><a href="${href}" style="display: inline-block; background-color: #013afb; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px;">${label}</a></div>\n`;
  },
};

const marked = new Marked({ gfm: true, breaks: true });

// Renderer needs `this.parser` to render child inline tokens, so we use a
// plain object with function expressions (not arrows) bound by marked.
/* eslint-disable @typescript-eslint/no-explicit-any */
marked.use({
  extensions: [broadcastButton],
  renderer: {
    paragraph(this: any, token: Tokens.Paragraph) {
      const inner = this.parser.parseInline(token.tokens);
      return `<p style="font-size: 16px; line-height: 1.6; margin: 0 0 18px;">${inner}</p>\n`;
    },
    heading(this: any, token: Tokens.Heading) {
      const inner = this.parser.parseInline(token.tokens);
      const sizes: Record<number, number> = {
        1: 26,
        2: 22,
        3: 18,
        4: 16,
        5: 14,
        6: 13,
      };
      const size = sizes[token.depth] ?? 16;
      const weight = token.depth <= 2 ? 700 : 600;
      return `<h${token.depth} style="font-size: ${size}px; font-weight: ${weight}; margin: 24px 0 12px; line-height: 1.3;">${inner}</h${token.depth}>\n`;
    },
    link(this: any, token: Tokens.Link) {
      const inner = this.parser.parseInline(token.tokens);
      const href = escapeHtml(sanitizeHref(token.href));
      return `<a href="${href}" style="color: #013afb; text-decoration: underline;">${inner}</a>`;
    },
    strong(this: any, token: Tokens.Strong) {
      const inner = this.parser.parseInline(token.tokens);
      return `<strong style="font-weight: 700;">${inner}</strong>`;
    },
    em(this: any, token: Tokens.Em) {
      const inner = this.parser.parseInline(token.tokens);
      return `<em style="font-style: italic;">${inner}</em>`;
    },
    list(this: any, token: Tokens.List) {
      const tag = token.ordered ? 'ol' : 'ul';
      const body = token.items
        .map((item) => {
          const itemInner = this.parser.parse(item.tokens, !!item.loose);
          return `<li style="margin-bottom: 6px; line-height: 1.6;">${itemInner}</li>`;
        })
        .join('');
      return `<${tag} style="font-size: 16px; margin: 0 0 18px; padding-left: 24px;">${body}</${tag}>\n`;
    },
    hr() {
      return '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0;" />\n';
    },
    blockquote(this: any, token: Tokens.Blockquote) {
      const inner = this.parser.parse(token.tokens);
      return `<blockquote style="border-left: 4px solid #00ff97; margin: 0 0 18px; padding: 4px 0 4px 16px; color: #475569; font-style: italic;">${inner}</blockquote>\n`;
    },
  },
});

// Tags + attrs DOMPurify is allowed to keep after sanitization. Marked passes
// arbitrary HTML through (no built-in sanitization since v5), so an admin who
// writes `<img src=x onerror=alert(1)>` in the body would otherwise ship that
// payload into the in-app previews (compose dialog, admin/dev detail pages)
// where `{@html}` executes it. The list mirrors the tags our custom
// renderers emit plus inline `style` (we rely on inline CSS for email
// clients that strip <style> tags).
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'a',
    'p',
    'br',
    'strong',
    'em',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'blockquote',
    'div',
    'span',
  ],
  ALLOWED_ATTR: ['href', 'style'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|about:blank$)/i,
};

export function renderBroadcastBodyHtml(markdown: string): string {
  const raw = marked.parse(markdown) as string;
  return DOMPurify.sanitize(raw, SANITIZE_CONFIG);
}

/**
 * Where to fetch the Epitech logo from inside the rendered email. Defaults
 * to a relative path so in-app previews (compose dialog, broadcast detail)
 * resolve against the current origin; server callers pass `env.ORIGIN` so
 * recipients' mail clients hit an absolute URL.
 */
const DEFAULT_LOGO_PATH = '/email/epitech-logo.png';

function shellOpen(baseUrl: string): string {
  const logoSrc = `${baseUrl}${DEFAULT_LOGO_PATH}`;
  return [
    `<div style="background-color: #f1f5f9; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">`,
    `<div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-top: 6px solid #013afb; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: left;">`,
    `<div style="padding: 32px 32px 0;">`,
    `<img src="${logoSrc}" alt="Epitech" width="140" style="display: block; height: auto; max-width: 140px; border: 0;" />`,
    `</div>`,
    `<div style="padding: 24px 32px 32px;">`,
  ].join('');
}

function shellClose(): string {
  const year = new Date().getFullYear();
  return [
    `</div>`,
    `<div style="border-top: 1px solid #e2e8f0; padding: 20px 32px; background-color: #f8fafc;">`,
    `<p style="margin: 0; font-size: 11px; line-height: 1.6; color: #64748b; text-align: center;">`,
    `Epitech &middot; L'&eacute;cole de l'innovation et de l'expertise informatique.<br />`,
    `&copy; ${year} Epitech &mdash; Groupe IONIS. Tous droits r&eacute;serv&eacute;s.`,
    `</p>`,
    `</div>`,
    `</div>`,
    `</div>`,
  ].join('');
}

export function wrapBroadcastHtml(innerHtml: string, baseUrl = ''): string {
  return `${shellOpen(baseUrl)}${innerHtml}${shellClose()}`;
}

/**
 * Render a markdown body into the full branded HTML mail. Pass `baseUrl` from
 * the server (e.g. `env.ORIGIN`) so the embedded `<img>` resolves to an
 * absolute URL in recipients' mail clients; the default empty string is fine
 * for in-app previews because the static asset is served on the same origin.
 */
export function renderBroadcastMail(markdown: string, baseUrl = ''): string {
  return wrapBroadcastHtml(renderBroadcastBodyHtml(markdown), baseUrl);
}
