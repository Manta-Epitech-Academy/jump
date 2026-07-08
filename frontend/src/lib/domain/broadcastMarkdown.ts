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
      // Gmail / Outlook strip the UA default `list-style: disc|decimal`, so
      // without an explicit declaration the items render bullet-less ("juste
      // un espace"). Forcing the type + position outside puts the marker back.
      const listStyle = token.ordered ? 'decimal' : 'disc';
      const body = token.items
        .map((item) => {
          const itemInner = this.parser.parse(item.tokens, !!item.loose);
          return `<li style="margin-bottom: 6px; line-height: 1.6;">${itemInner}</li>`;
        })
        .join('');
      return `<${tag} style="font-size: 16px; margin: 0 0 18px; padding-left: 24px; list-style-type: ${listStyle}; list-style-position: outside;">${body}</${tag}>\n`;
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

function renderBroadcastBodyHtml(markdown: string): string {
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

function wrapBroadcastHtml(innerHtml: string, baseUrl = ''): string {
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

/**
 * Wrap the branded inner shell in a complete HTML document.
 *
 * The shell from {@link wrapBroadcastHtml} is a bare `<div>` fragment. Shipped
 * as the HTML part of an email it carries no `<html>`/`<body>`, which
 * SpamAssassin scores as HTML_MIME_NO_HTML_TAG and Gmail/Outlook read as a tell
 * of auto-generated spam. Only the server send paths use this; in-app previews
 * keep the fragment ({@link renderBroadcastMail}) because a full document
 * injected via `{@html}` would nest `<html>`/`<body>` inside the live DOM.
 */
function wrapEmailDocument(shellHtml: string, subject = ''): string {
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
    '<body style="margin: 0; padding: 0; background-color: #f1f5f9;">',
    shellHtml,
    '</body>',
    '</html>',
  ].join('');
}

// Walking marked's token tree (rather than regex-scrubbing rendered output)
// keeps URLs out of reach of emphasis handling. Tokens are typed as the
// `Tokens.Generic` catch-all: marked folds custom tokens (our `broadcastButton`)
// and the whole union into it, so per-type narrowing isn't available. Same
// pragmatic shape the HTML renderers above use.

/** Inline tokens → their bare text, dropping emphasis/code markers. */
function inlineTokensToText(tokens: Tokens.Generic[] | undefined): string {
  if (!tokens) return '';
  return tokens.map(inlineTokenToText).join('');
}

function inlineTokenToText(token: Tokens.Generic): string {
  switch (token.type) {
    case 'escape':
    case 'codespan':
      return token.text;
    case 'br':
      return '\n';
    case 'strong':
    case 'em':
    case 'del':
      return inlineTokensToText(token.tokens);
    case 'link': {
      // The href lives in its own field, so emphasis handling never reaches
      // inside the URL. When the label already spells out its destination the
      // link is an autolink (gfm turns a bare `https://…`, email, or phone in
      // the body into one); mail clients don't linkify plain text, so we keep
      // the raw target but show it once instead of "addr (mailto:addr)". The
      // mailto:/tel: scheme is stripped only for that sameness check, never
      // from the surfaced href.
      const label = inlineTokensToText(token.tokens).trim();
      const href = String(token.href ?? '').trim();
      if (!href) return label;
      if (!label) return href;
      const target = href.replace(/^(?:mailto|tel):/i, '');
      return target === label ? label : `${label} (${href})`;
    }
    case 'image':
      return token.text;
    case 'text':
      return token.tokens ? inlineTokensToText(token.tokens) : token.text;
    default:
      return '';
  }
}

function listToText(list: Tokens.Generic): string {
  const items = list.items as Tokens.Generic[];
  return items
    .map((item, index) => {
      const marker = list.ordered
        ? `${(Number(list.start) || 1) + index}. `
        : '- ';
      // Flatten any sub-blocks to a single line; these nudge mails use one-line
      // bullets, and a wrapped marker reads worse than a long line in plain text.
      const body = blockTokensToText(item.tokens).replace(/\n+/g, ' ').trim();
      return `${marker}${body}`;
    })
    .join('\n');
}

function blockTokenToText(token: Tokens.Generic): string {
  switch (token.type) {
    case 'heading':
    case 'paragraph':
      return inlineTokensToText(token.tokens).trim();
    case 'text':
      return (
        token.tokens ? inlineTokensToText(token.tokens) : token.text
      ).trim();
    case 'code':
      return token.text;
    case 'blockquote':
      return blockTokensToText(token.tokens);
    case 'list':
      return listToText(token);
    case 'broadcastButton': {
      const label = String(token.label ?? '').trim();
      const href = String(token.href ?? '').trim();
      return href ? `${label} : ${href}` : label;
    }
    default:
      // space, hr, and anything we don't surface in plain text → block break.
      return '';
  }
}

function blockTokensToText(tokens: Tokens.Generic[] | undefined): string {
  if (!tokens) return '';
  const blocks: string[] = [];
  for (const token of tokens) {
    const rendered = blockTokenToText(token);
    if (rendered) blocks.push(rendered);
  }
  return blocks.join('\n\n');
}

/**
 * Plain-text rendering of a broadcast markdown body, for the `text/plain`
 * alternative of a multipart email. Without it the message is HTML-only
 * (SpamAssassin's MIME_HTML_ONLY penalty), and clients that refuse HTML
 * (locked-down corporate mail, smartwatches) show an empty message.
 *
 * Built by walking marked's token tree, not by regex-scrubbing the rendered
 * string. URLs live in `link` / `broadcastButton` href fields, so emphasis
 * handling can never reach inside them: a flat-text regex pass would delete
 * the `_` pairs inside base64url magic-link tokens ({{fastlogin_link}}) and
 * ship a broken login link in the text part (~13% of tokens carry such a
 * pair). Links are kept inline as raw URLs so they survive and so the
 * per-recipient tracking rewrite (`rewriteSmsLinks`, which scans for bare
 * URLs) still reaches them.
 */
function renderBroadcastText(markdown: string): string {
  return blockTokensToText(marked.lexer(markdown))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface RenderedBroadcastEmail {
  /** Full HTML document (DOCTYPE + `<html>`/`<head>`/`<body>`) for the HTML part. */
  html: string;
  /** Plain-text alternative for the `text/plain` part. */
  text: string;
}

/**
 * Render a markdown body into a complete, MIME-ready email: a full HTML
 * document (no HTML_MIME_NO_HTML_TAG) paired with a plain-text alternative (no
 * MIME_HTML_ONLY). Every server send path builds its payload from this; in-app
 * previews keep {@link renderBroadcastMail} (the DOM-safe fragment).
 */
export function renderBroadcastEmail(
  markdown: string,
  baseUrl = '',
  subject = '',
): RenderedBroadcastEmail {
  return {
    html: wrapEmailDocument(renderBroadcastMail(markdown, baseUrl), subject),
    text: renderBroadcastText(markdown),
  };
}
