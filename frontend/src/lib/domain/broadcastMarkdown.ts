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

export function renderBroadcastBodyHtml(markdown: string): string {
  const raw = marked.parse(markdown) as string;
  return DOMPurify.sanitize(raw, SANITIZE_CONFIG);
}

/**
 * Epitech logo embedded as a `data:` URI so the email is self-contained.
 * Recipients see the logo without needing to whitelist external images on
 * their first read — at the cost of a few KB of payload per send.
 *
 * Source: optimised from `static/email/epitech-logo.png` (downscaled to
 * 280×69, 16-color palette via `ffmpeg ... palettegen=max_colors=16`).
 * 2.6 KB PNG → 3.5 KB base64; displayed at width="140".
 *
 * Caveat: Gmail Web rewrites `data:` images through its proxy, which works
 * but adds a small first-paint delay; Outlook 2007–2010 don't support
 * `data:` at all and will show the `alt` fallback. Acceptable trade-off for
 * this audience (Gmail dominant, Apple Mail next).
 */
const EPITECH_LOGO_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAARgAAABFCAMAAACmNwkjAAAACXBIWXMAAAAAAAAAAQCEeRdzAAADAFBMVEUBOfwCPPcLQuITR88ZTb4gUq4lVqApWZUxX4I8Z2dGblBGb05Hb01IcEtLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0JLc0IA/wA9JubLAAABAHRSTlP///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8AU/cHJQAABgRJREFUeJztXIuWoyAMJWj//4NbyAokPIQA2joze+pdz0xXIoQLhCTSAVQRCyoE9wGzm18AcJ1GQNCvdHONH4wTUd9FCcF3emPGgFqYGyZm3W46AViev6PcL8Lx8jCu80qZlZhhYgy4uYTr99ES8FSPFzhuDN1YU5lj5lt52fDUCJkhWYtC/cPK/ClokzOzdiS/DhA2ZY+bGAE3MQJuYgTcxAi4iRFwEyPgJkbAFDGrFWNLVCCUQPSulYpC2ijxASdm48fFSkI7XVbbiHwxa6Yq5ZJu/DNBjFPRuT4I+38hS1HdDkWIWayq6PH8s1Cdw+MlipX9DPRx2qCQ0bYhT8pIBUeIWU1IRmA90FR5s5fBizTRx6bHIfvcqI4V96w0xYqbGy2ePWovY8ZJZkMxqqiBETHLxrtrVQFxkP9EbqNV5mPVqBn9xvi5figCFBArHaEgp1i3XDCWS6xgo7I9BsSs1jeKwjWoHLpjJj6V+tq8dnKiVtUDuWJDvQbEmDkdRWztL2YslmPp85L6fXq8ptAnZqVFgX7aNi6nQ7MgqdnYXVgqdpfueFjY395dsY6qvr3MO+gTEwe7NwpCEXdOra9dSfYAkgVLJY+8RMaaptA1eerBUuL5grAcqwHZ9UG1nzLxAWupDc0Jss2xsGy5US3NoQ/1Gl7L2w99RX5tysHbDMV+1BMkL2mhLlYDmh4Asgi5FcLGpxpJ7Z5q76BLjJvWYbqeaNwAT/UhHjW5/YUUqRyIvYEuMU8g30BcRz0sBtkfOY6xJ0Cb9bnqx5gLIk+9PAC/uc4w0xLpPua0np2OJzFHTLWxzMDbmDlvJ//PjDOC/IgYab6NATGk40EfLcCe8re2+DvQ2RsMy2vpHEDUK03BPjFptz6uA0Tn8BBeQF02PWaoY6f26Ydwv1yWJTF7VbRhCyct5t1hiZbISS8DTLPNgukJE4PQSAs0JZ+FIBGjvQdZdeHFsj5XUl+pCUqMpMiWiraBPbgOtSUHb8KlnTHsnOlJl7QOt5a3Qh3sViBm9fK67oKbzn7SSheJmUjFLsY8vnFwDqcTuMbFMLVb4mzwa0JKLixhT4xLurRocS3rCRuxWCmvpE5sHMg+c/PyEqofvZ2F2XqCYHw+YCNGe+sq6Q8NwnfML2LSxgUTJ/TrZWR8MlW18lafgNnYAAsbG6sbUtczDU1boHu8kG5WLj8VyYDqzBjO0V3Ci2Nio4JmjNsZjWuzsZiW5KNVNoyT17rZjbB/nNEeqEFxSA7OmIbxFeB3EBrLYHxfPq1s62SbTaqgZH1TLmtXcu7YGsTuiy0+Dxh0rKtJOekSS3ivEOY4bdfGu1WVneH929lmqWXO8vlXTMkSnAnIY2PEy9ADmghVoHZCJHNqPVdUWjp4+4bibBZts6voo5EuG+up84BTLVbLAJrzZecRTwWRPV5YuU9lAPyLBRzxQpP0ozFkqf8MMY3ZWNbotfxUBoDdxB4vyQf8MCaPmsXJdU32sIn4dqQnpA1NmaPvZuYxnDF+VBq5x+sQTFZ3MnAI3lvib2ImtXkyH3MO7AYNVgm7S9f4eWr+LcGPUUM9HaShKJ/smPmNtwRpYKwWYp6PrzHNPqUC4X2RazKms1zaRtcpl/fV6hNDuQnHz0/Z32dKAdmOBeGsjfPxLzE0g1e0pCWgsEtcsMLnmjSQosrZFN0hDJaSTqNx6rTDCdj8GEM77eDVyei4Qq/hMZBezuEaarTdR+r7RJUHdlV7G6NdCUHW8aLXgEYjNOdnMWOCapLc+xhu15RLvu6ETg0bztYNu4w+R3uNDhN+DLpMN7ZPB5UHh7poS7XvGp9p7p4bIrklnDZpSYGVtZpQecLBe6mHlQ/6Tm4BWPzq31Uul9E5W5zBuDxFW7J1/HfUbIYpz7frLh3h5cCj036T5JPLlU9pfB+ZF3ATI+AmRsBNjICbGAE3MQJuYgTcxBSQjppdl1v+D1B2viAG8EdfB/wtPMpvMTExS/j7Ma9Ffyc1WzgYwnfObTMxrzXEHNbSoYUvAn0r0Z9aqf7ikAvaXEDLh+S/CvTdnuJvVP0DGKSPEbBAFcAAAAAASUVORK5CYII=';

function shellOpen(): string {
  return [
    `<div style="background-color: #f1f5f9; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">`,
    `<div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-top: 6px solid #013afb; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: left;">`,
    `<div style="padding: 32px 32px 0;">`,
    `<img src="${EPITECH_LOGO_DATA_URI}" alt="Epitech Academy" width="140" style="display: block; height: auto; max-width: 140px; border: 0;" />`,
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

// `baseUrl` is kept on the signature for API compat — callers still pass
// `env.ORIGIN`. The logo is now inlined as a data URI so it isn't used here.
export function wrapBroadcastHtml(
  innerHtml: string,
  _baseUrl: string = '',
): string {
  return `${shellOpen()}${innerHtml}${shellClose()}`;
}

/**
 * Render a markdown body into the full branded HTML mail. `baseUrl` is
 * accepted for API compat with earlier callers (still pass `env.ORIGIN`)
 * but is no longer used by the shell — the logo is inlined as a data URI.
 */
export function renderBroadcastMail(
  markdown: string,
  _baseUrl: string = '',
): string {
  return wrapBroadcastHtml(renderBroadcastBodyHtml(markdown));
}
