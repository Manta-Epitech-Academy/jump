import { describe, it, expect } from 'vitest';
import { authoredMarkdownProblems, renderAuthoredMarkdown } from './markdown';

describe('authoredMarkdownProblems', () => {
  it('accepts headings, lists, emphasis and https or mail links', () => {
    expect(
      authoredMarkdownProblems(
        '## Bonne rentrée\n\n- Coding Club le **7 octobre**\n- [Discord](https://discord.gg/epitech)\n\nUne question ? [Écris-nous](mailto:lille@epitech.eu), ou https://www.epitech.invalid',
      ),
    ).toEqual([]);
  });

  it('refuses an image, even inside a list', () => {
    expect(
      authoredMarkdownProblems('- ![affiche](https://tracker.example/a.png)'),
    ).toEqual(['Les images ne sont pas acceptées.']);
  });

  it('refuses raw HTML, block or inline', () => {
    expect(authoredMarkdownProblems('<div>salut</div>')).toHaveLength(1);
    expect(authoredMarkdownProblems('salut <b>toi</b>')).toHaveLength(1);
  });

  it('refuses a link that is not https or mailto', () => {
    const [problem] = authoredMarkdownProblems(
      '[clique](javascript:alert(1)) et [là](http://example.com)',
    );
    expect(problem).toContain('javascript:alert(1)');
    expect(authoredMarkdownProblems('[là](http://example.com)')).toHaveLength(
      1,
    );
    expect(authoredMarkdownProblems('[relatif](/xp)')).toHaveLength(1);
  });
});

describe('renderAuthoredMarkdown', () => {
  it('opens every link in a new tab without a referrer', () => {
    const html = renderAuthoredMarkdown('[Discord](https://discord.gg/x)');
    expect(html).toContain('href="https://discord.gg/x"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('never renders an image, whatever was stored', () => {
    expect(
      renderAuthoredMarkdown('![x](https://tracker.example/a.png)'),
    ).not.toContain('<img');
  });

  it('binds French punctuation to its word, and leaves Markdown syntax alone', () => {
    const html = renderAuthoredMarkdown(
      '## Bonne rentrée !\n\n| Jour | Heure |\n| :--- | ---: |\n| Mercredi | 14:00 |',
    );
    expect(html).toContain('Bonne rentrée&nbsp;!');
    expect(html).toContain('<table>');
    expect(html).toContain('14:00');
  });
});
