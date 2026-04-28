import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import DOMPurify from 'isomorphic-dompurify';

const renderer = {
  code({ text, lang }: { text: string; lang?: string }) {
    const language = lang && hljs.getLanguage(lang) ? lang : '';
    const label = language || 'code';
    return `<div class="code-block-wrapper"><div class="code-block-lang">${label}</div><pre><code class="hljs${language ? ` language-${language}` : ''}">${text}</code></pre></div>`;
  },
};

const marked = new Marked(
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

export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown) as string;
  return DOMPurify.sanitize(html);
}
