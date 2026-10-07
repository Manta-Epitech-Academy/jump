import { Marked, type Tokens } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import DOMPurify from 'isomorphic-dompurify';
import { typeset } from './domain/typography';
import type { ShownPicture } from './domain/pictures';

const renderer = {
  code({ text, lang }: { text: string; lang?: string }) {
    const language = lang && hljs.getLanguage(lang) ? lang : '';
    const label = language || 'code';
    return `<div class="code-block-wrapper"><div class="code-block-lang">${label}</div><pre><code class="hljs${language ? ` language-${language}` : ''}">${text}</code></pre></div>`;
  },
};

function createMarked(): Marked {
  return new Marked(
    markedHighlight({
      emptyLangClass: 'hljs',
      langPrefix: 'hljs language-',
      highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    }),
    {
      gfm: true,
      breaks: true,
      renderer,
    },
  );
}

const marked = createMarked();

export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown) as string;
  return DOMPurify.sanitize(html);
}

// ─── Markdown staff author for talents to read ───
//
// Content typed over the admin API (`write_talent_home_note`) and rendered on a
// talent's home. Three rules on top of `renderMarkdown`, all about what a
// minor's browser ends up doing:
//
//   - No raw HTML. It is refused at write time, not silently stripped at
//     render time, so what is stored is exactly what is shown.
//   - A picture is named by an https address, which the write copies into
//     Jump; the page draws the copy, never the address, since a talent's
//     browser fetches nothing from another host (DESIGN.md). A picture with
//     no copy is not drawn at all.
//   - A link goes to https or to a mail address, and opens in a new tab with no
//     referrer, so leaving Jump never takes the dashboard with it.
//
// And one courtesy on top: its text is typeset (`typeset`), so a « ! » the
// author spaced the French way never wraps alone onto the next line. Only the
// text runs are touched, never the Markdown itself, whose syntax has spaced
// colons of its own (a table's `| :--- |`).

const escapeAttribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/**
 * The parser for one render, drawing each picture from its copy in `pictures`
 * (by the address the Markdown names) and nothing for a picture without one.
 * An animation gives way to its still for a talent who asked for reduced
 * motion.
 *
 * `use` chains the typesetting after the highlighter's own `walkTokens`, which
 * passing `walkTokens` to `parse` would replace. A text token with children
 * renders them; only a leaf carries the text that is printed.
 */
function authoredMarked(pictures: ReadonlyMap<string, ShownPicture>): Marked {
  return createMarked().use({
    walkTokens(token) {
      if (token.type === 'text' && !token.tokens)
        token.text = typeset(token.text);
    },
    renderer: {
      image({ href, text }) {
        const picture = pictures.get(href);
        if (!picture) return '';
        const still =
          picture.stillUrl === null
            ? ''
            : `<source media="(prefers-reduced-motion: reduce)" srcset="${escapeAttribute(picture.stillUrl)}">`;
        return `<picture>${still}<img src="${escapeAttribute(picture.url)}" alt="${escapeAttribute(text)}" width="${picture.width}" height="${picture.height}" loading="lazy" decoding="async"></picture>`;
      },
    },
  });
}

const AUTHORED_LINK_PROTOCOLS = new Set(['https:', 'mailto:']);
/**
 * A picture is downloaded from its address (`images/remote.ts`), so it has to
 * be one that parses: an address that only starts like one (`https://`) would
 * pass a prefix test and fail the copy as an internal error.
 */
const AUTHORED_PICTURE_PROTOCOLS = new Set(['https:']);

function isAuthoredHref(
  href: string,
  protocols: ReadonlySet<string> = AUTHORED_LINK_PROTOCOLS,
): boolean {
  try {
    return protocols.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

/** Every picture token of this Markdown, in order. */
function imageTokens(markdown: string): { href: string }[] {
  const images: { href: string }[] = [];
  marked.walkTokens(marked.lexer(markdown), (token) => {
    if (token.type === 'image')
      images.push({ href: (token as Tokens.Image).href });
  });
  return images;
}

/** The addresses of this Markdown's pictures, each once, in order. */
export function authoredImageSources(markdown: string): string[] {
  return [...new Set(imageTokens(markdown).map((image) => image.href))];
}

/**
 * The length of what the author wrote, leaving out the addresses of its
 * pictures: a CDN address can run to hundreds of characters nobody reads.
 *
 * Each address is left out once, and only if it is written out in the source.
 * A reference-style picture (`![a][r]`, with `[r]: https://…` defined once)
 * names its address once however many times it is used, so leaving it out
 * per use would count less than the text itself, below zero if repeated.
 */
export function authoredTextLength(markdown: string): number {
  return authoredImageSources(markdown).reduce(
    (length, href) => (markdown.includes(href) ? length - href.length : length),
    markdown.length,
  );
}

/**
 * What stops this Markdown from being stored, in French, one line per kind of
 * problem. Empty means it is accepted as written.
 */
export function authoredMarkdownProblems(markdown: string): string[] {
  const problems = new Set<string>();
  marked.walkTokens(marked.lexer(markdown), (token) => {
    if (token.type === 'image') {
      if (!isAuthoredHref(token.href, AUTHORED_PICTURE_PROTOCOLS))
        problems.add(
          `Image refusée (${token.href}) : donnez son adresse complète, en https://.`,
        );
    } else if (token.type === 'html') {
      problems.add('Le HTML n’est pas accepté, seulement le Markdown.');
    } else if (token.type === 'link' && !isAuthoredHref(token.href)) {
      problems.add(linkProblem(token.raw, token.href));
    }
  });
  return [...problems];
}

/**
 * A refused link, in the author's own words. A bare `www.` address is linked by
 * GFM to `http://`, a scheme the author never typed, so it is named as written
 * and the full https address is given to copy back.
 */
function linkProblem(raw: string, href: string): string {
  if (raw.startsWith('www.'))
    return `Lien refusé (${raw}) : écrivez l’adresse complète, https://${raw}.`;
  return `Lien refusé (${href}) : seuls les liens https:// et mailto: sont acceptés.`;
}

function openLinksElsewhere(node: Element): void {
  if (node.nodeName !== 'A') return;
  node.setAttribute('target', '_blank');
  node.setAttribute('rel', 'noopener noreferrer');
}

/**
 * Render Markdown that passed `authoredMarkdownProblems`, drawing its pictures
 * from their copies (`pictures`, by the address the Markdown names).
 *
 * The sanitiser is the second line: whatever reaches it, a picture whose
 * address is not one of those copies loses it, should a row ever be written
 * another way. The hook is added and removed around the one synchronous
 * `sanitize` call, so no other DOMPurify caller inherits it.
 */
export function renderAuthoredMarkdown(
  markdown: string,
  pictures: ReadonlyMap<string, ShownPicture> = new Map(),
): string {
  const html = authoredMarked(pictures).parse(markdown) as string;
  const copies = new Set(
    [...pictures.values()].flatMap((picture) =>
      picture.stillUrl ? [picture.url, picture.stillUrl] : [picture.url],
    ),
  );
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    openLinksElsewhere(node);
    for (const attribute of ['src', 'srcset']) {
      const value = node.getAttribute(attribute);
      if (value !== null && !copies.has(value)) node.removeAttribute(attribute);
    }
  });
  try {
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ['picture', 'source'],
      ADD_ATTR: ['srcset', 'media', 'loading', 'decoding'],
    });
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}
