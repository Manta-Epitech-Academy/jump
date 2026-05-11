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

const BUTTON_RE = /^:button\[([^\]\n]+)\]\(([^)\n]+)\)\s*(?:\n|$)/;

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
    const href = escapeHtml(t.href);
    const label = escapeHtml(t.label);
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
      return `<a href="${token.href}" style="color: #013afb; text-decoration: underline;">${inner}</a>`;
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

export function renderBroadcastBodyHtml(markdown: string): string {
  return marked.parse(markdown) as string;
}

const SHELL_OPEN = `<div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;">`;
const SHELL_CLOSE = `</div></div>`;

export function wrapBroadcastHtml(innerHtml: string): string {
  return `${SHELL_OPEN}${innerHtml}${SHELL_CLOSE}`;
}

/**
 * Render a markdown body into the full branded HTML mail.
 */
export function renderBroadcastMail(markdown: string): string {
  return wrapBroadcastHtml(renderBroadcastBodyHtml(markdown));
}
