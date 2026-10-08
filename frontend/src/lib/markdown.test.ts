import { describe, it, expect } from 'vitest';
import {
  authoredImageSources,
  authoredMarkdownProblems,
  authoredTextLength,
  renderAuthoredMarkdown,
} from './markdown';
import type { ShownPicture } from './domain/pictures';

describe('authoredMarkdownProblems', () => {
  it('accepts headings, lists, emphasis and https or mail links', () => {
    expect(
      authoredMarkdownProblems(
        '## Bonne rentrée\n\n- Coding Club le **7 octobre**\n- [Discord](https://discord.gg/epitech)\n\nUne question ? [Écris-nous](mailto:lille@epitech.eu), ou https://www.epitech.invalid',
      ),
    ).toEqual([]);
  });

  it('accepts a picture named by an https address, and refuses any other', () => {
    expect(
      authoredMarkdownProblems('- ![affiche](https://cdn.example/a.png)'),
    ).toEqual([]);
    expect(
      authoredMarkdownProblems('![affiche](http://cdn.example/a.png)'),
    ).toEqual([
      'Image refusée (http://cdn.example/a.png) : donnez son adresse complète, en https://.',
    ]);
    expect(authoredMarkdownProblems('![affiche](/a.png)')).toHaveLength(1);
  });

  it('refuses a picture address that starts like https but does not parse', () => {
    for (const markdown of [
      '![affiche](https://)',
      '![affiche](<https://cdn example/a.png>)',
    ])
      expect(authoredMarkdownProblems(markdown)).toHaveLength(1);
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

  it('names a bare www address as written, with the https one to use', () => {
    expect(authoredMarkdownProblems('Infos sur www.epitech.invalid !')).toEqual(
      [
        'Lien refusé (www.epitech.invalid) : écrivez l’adresse complète, https://www.epitech.invalid.',
      ],
    );
  });
});

describe('renderAuthoredMarkdown', () => {
  it('opens every link in a new tab without a referrer', () => {
    const html = renderAuthoredMarkdown('[Discord](https://discord.gg/x)');
    expect(html).toContain('href="https://discord.gg/x"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  const affiche: ShownPicture = {
    url: '/api/talent-home/images/c1/note-w-0.webp',
    width: 1080,
    height: 1350,
    stillUrl: null,
  };
  const anime: ShownPicture = {
    url: '/api/talent-home/images/c1/note-w-1.gif',
    width: 480,
    height: 270,
    stillUrl: '/api/talent-home/images/c1/note-w-1-still.webp',
  };
  const copies = new Map([
    ['https://cdn.example/affiche.png', affiche],
    ['https://cdn.example/demo.gif', anime],
  ]);

  it('draws a picture from its copy, sized, never from the address written', () => {
    const html = renderAuthoredMarkdown(
      '![L’affiche du stage](https://cdn.example/affiche.png)',
      copies,
    );
    expect(html).toContain(`src="${affiche.url}"`);
    expect(html).toContain('width="1080"');
    expect(html).toContain('height="1350"');
    expect(html).toContain('alt="L’affiche du stage"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('cdn.example');
  });

  it('gives an animation its still under reduced motion', () => {
    const html = renderAuthoredMarkdown(
      '![démo](https://cdn.example/demo.gif)',
      copies,
    );
    expect(html).toContain('<picture>');
    expect(html).toContain('media="(prefers-reduced-motion: reduce)"');
    expect(html).toContain(`srcset="${anime.stillUrl}"`);
  });

  it('draws nothing for a picture with no copy, whatever was stored', () => {
    expect(
      renderAuthoredMarkdown('![x](https://tracker.example/a.png)', copies),
    ).not.toContain('<img');
    expect(
      renderAuthoredMarkdown('![x](https://tracker.example/a.png)'),
    ).not.toContain('tracker.example');
  });

  it('strips an address that is not a copy from a picture that reached the sanitiser', () => {
    const html = renderAuthoredMarkdown(
      '<img src="https://tracker.example/pixel.gif">',
      copies,
    );
    expect(html).not.toContain('tracker.example');
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

describe('the pictures of authored Markdown', () => {
  const note =
    '![a](https://cdn.example/a.png) texte ![b](https://cdn.example/very/long/address/b.gif) ![a encore](https://cdn.example/a.png)';

  it('lists each address once, in order', () => {
    expect(authoredImageSources(note)).toEqual([
      'https://cdn.example/a.png',
      'https://cdn.example/very/long/address/b.gif',
    ]);
  });

  it('counts the text without the addresses, each once', () => {
    expect(authoredTextLength(note)).toBe(
      note.length -
        'https://cdn.example/a.png'.length -
        'https://cdn.example/very/long/address/b.gif'.length,
    );
  });

  it('never counts less than the text of a reference-style picture used again and again', () => {
    const address = `https://cdn.example/${'x'.repeat(200)}.png`;
    const repeated = `${'![a][r] '.repeat(50)}\n\n[r]: ${address}`;
    expect(authoredTextLength(repeated)).toBe(repeated.length - address.length);
  });
});
