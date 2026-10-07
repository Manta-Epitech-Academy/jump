import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import DOMPurify from 'isomorphic-dompurify';
import { typeset } from './domain/typography';

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
// talent's home. Two rules on top of `renderMarkdown`, and both are about what
// a minor's browser ends up doing:
//
//   - No image and no raw HTML. An image is a request to whatever host the
//     author named, and a talent's browser fetches nothing from another host
//     (DESIGN.md). Such content is refused at write time, not silently
//     stripped at render time, so what is stored is exactly what is shown.
//   - A link goes to https or to a mail address, and opens in a new tab with no
//     referrer, so leaving Jump never takes the dashboard with it.
//
// And one courtesy on top: its text is typeset (`typeset`), so a « ! » the
// author spaced the French way never wraps alone onto the next line. Only the
// text runs are touched, never the Markdown itself, whose syntax has spaced
// colons of its own (a table's `| :--- |`).

// `use` chains this after the highlighter's own `walkTokens`, which passing
// `walkTokens` to `parse` would replace. A text token with children renders
// them; only a leaf carries the text that is printed.
const authoredMarked = createMarked().use({
  walkTokens(token) {
    if (token.type === 'text' && !token.tokens)
      token.text = typeset(token.text);
  },
});

const AUTHORED_LINK_PROTOCOLS = new Set(['https:', 'mailto:']);

function isAuthoredHref(href: string): boolean {
  try {
    return AUTHORED_LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

/**
 * What stops this Markdown from being stored, in French, one line per kind of
 * problem. Empty means it is accepted as written.
 */
export function authoredMarkdownProblems(markdown: string): string[] {
  const problems = new Set<string>();
  marked.walkTokens(marked.lexer(markdown), (token) => {
    if (token.type === 'image') {
      problems.add('Les images ne sont pas acceptées.');
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
 * Render Markdown that passed `authoredMarkdownProblems`. Images are still
 * forbidden here, as a second line should a row ever be written another way.
 * The hook is added and removed around the one synchronous `sanitize` call, as
 * in `server/cms/sanitize.ts`, so no other DOMPurify caller inherits it.
 */
export function renderAuthoredMarkdown(markdown: string): string {
  const html = authoredMarked.parse(markdown) as string;
  DOMPurify.addHook('afterSanitizeAttributes', openLinksElsewhere);
  try {
    return DOMPurify.sanitize(html, { FORBID_TAGS: ['img'] });
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}
