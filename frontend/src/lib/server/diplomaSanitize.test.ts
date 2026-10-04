/**
 * The guard rails on a certificate design, at the unit level.
 *
 * Worth having separately from the integration test that drives the same code
 * through the write operation: that one proves a bad design is refused and
 * stored nowhere, which is the behaviour. These prove what the screening does to
 * the bytes, which is where every bug so far has been. None of them is visible
 * from the outside, because a refusal and a silently altered value look alike
 * from the API until somebody prints the document.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeCertificateDesign } from './diplomaSanitize';

/** A design that has nothing wrong with it, to vary one field at a time from. */
const CLEAN = {
  styleCss: '.title { font-family: Anton, sans-serif }',
  bodyHtml: '<h1 class="title">{prenom} {nom}</h1>',
};

function screen(design: Partial<typeof CLEAN>) {
  return sanitizeCertificateDesign({ ...CLEAN, ...design });
}

describe('what a stored stylesheet may contain', () => {
  // The stylesheet is emitted inside a `<style>` element, so a closing tag is the
  // whole trick: past it the rest of the design is parsed as markup in the head,
  // and a script tag there is a script tag.
  it('refuses a closing tag, which is how a design leaves the style element', () => {
    const { problems } = screen({ styleCss: '.a{}</style>' });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('<');
  });

  // The other half of a one-character rule: it must not eat real CSS. A child
  // selector needs `>`, and a literal chevron has a CSS escape.
  it('accepts a child selector and an escaped chevron', () => {
    expect(
      screen({
        styleCss: '.a > .b { color: #000 } .c::after { content: "\\3C" }',
      }).problems,
    ).toEqual([]);
  });

  it('refuses what would fetch, and says each reason', () => {
    // An `@import` of a remote sheet breaks two separate rules, and the author is
    // told both, which is the point of refusing rather than only sanitising.
    const imported = screen({
      styleCss: "@import url('http://x/y')",
    }).problems.join(' ');
    expect(imported).toContain('@import');
    expect(imported).toContain('url(...)');
  });

  // A reference inside the document fetches nothing, so it is not "remote".
  it('accepts a reference to a fragment of the page', () => {
    expect(screen({ styleCss: '.a { clip-path: url(#c) }' }).problems).toEqual(
      [],
    );
  });

  it('stores a stylesheet that passes exactly as written', () => {
    expect(screen({}).design.styleCss).toBe(CLEAN.styleCss);
  });
});

describe('what a stored body keeps', () => {
  // The sanitiser's URI rule is applied by DOMPurify to every attribute outside
  // a short URI-safe list, so a rule of `^data:` alone took these out as if they
  // were links, and nothing told the author.
  it('keeps ordinary attributes byte for byte', () => {
    const html =
      '<p lang="en" dir="rtl">a</p><img src="data:image/png;base64,AA" width="120" alt="x">';

    const { design, problems } = screen({ bodyHtml: html });

    expect(problems).toEqual([]);
    expect(design.bodyHtml).toBe(html);
  });

  // Clobbering protection refuses an id that names a property of `document`,
  // which guards nothing in a page printed with scripts off.
  it('keeps an id that a live page would reserve', () => {
    const html = '<h1 id="title">{prenom}</h1><p id="name">a</p>';

    const { design, problems } = screen({ bodyHtml: html });

    expect(problems).toEqual([]);
    expect(design.bodyHtml).toBe(html);
  });

  it('keeps table geometry', () => {
    const { design, problems } = screen({
      bodyHtml: '<table><tr><td colspan="2" width="50%">a</td></tr></table>',
    });

    expect(problems).toEqual([]);
    expect(design.bodyHtml).toContain('colspan="2"');
    expect(design.bodyHtml).toContain('width="50%"');
  });

  // The authoring contract tells people to embed images as data URIs, and a data
  // URI carries a `;` of its own. Splitting the attribute on `;` to filter its
  // declarations rejoined the halves with a space, and Chrome then computed
  // `background-image: none`: an image silently absent from a printed document.
  it('leaves a data URI in an inline style byte for byte', () => {
    const html =
      '<div style="background: url(data:image/png;base64,iVBORw0KAAAA)">a</div>';

    expect(screen({ bodyHtml: html }).design.bodyHtml).toBe(html);
  });

  it('leaves a link to a fragment of the page alone', () => {
    const html = '<a href="#signatures">a</a>';

    expect(screen({ bodyHtml: html }).problems).toEqual([]);
  });
});

describe('what a stored drawing keeps', () => {
  /**
   * A ghost, its gradient, a reused eye, a soft filter and a word in the brand
   * face: what an author actually reaches for, and what used to be built out of
   * clip-path polygons and tiled gradients because SVG was refused.
   */
  const GHOST = `<svg class="ghost" viewBox="0 0 84 120" width="84" height="120"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"></stop><stop offset="1" stop-color="#e4e7fc"></stop></linearGradient><filter id="soft"><feGaussianBlur stdDeviation="1"></feGaussianBlur></filter><symbol id="eye"><ellipse cx="5" cy="7" rx="5" ry="7" fill="#0e1442"></ellipse></symbol></defs><path d="M0 42a42 42 0 0 1 84 0v58l-14-9-14 9-14-9-14 9-14-9-14 9z" fill="url(#g)" filter="url(#soft)"></path><use href="#eye" x="24" y="32"></use><use href="#eye" x="46" y="30"></use><text x="42" y="116" text-anchor="middle" font-family="Anton">BOO</text></svg>`;

  it('keeps shapes, gradients, filters, reuse and text byte for byte', () => {
    const { design, problems } = screen({ bodyHtml: GHOST });

    expect(problems).toEqual([]);
    expect(design.bodyHtml).toBe(GHOST);
  });

  // The root a model writes by habit next to `xlink:href`. Its namespace value
  // starts with `http:`, which the address rule used to read as a link.
  it('keeps the xlink namespace declaration', () => {
    const html =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a"></use></svg>';

    const { design, problems } = screen({ bodyHtml: html });

    expect(problems).toEqual([]);
    expect(design.bodyHtml).toBe(html);
  });

  // Every page repeats the markup, so a drawing's ids repeat too. That is valid
  // enough for Chrome, which resolves `url(#g)` to the first one, and they are
  // identical by construction since every page is the same template.
  it('accepts the same drawing on a page that also carries tokens', () => {
    const { problems } = screen({
      bodyHtml: `${GHOST}<h1 class="title">{prenom} {nom}</h1>`,
    });

    expect(problems).toEqual([]);
  });
});

describe('what a stored body refuses, naming it', () => {
  it.each([
    ['a script', '<script>fetch("http://x")</script><p>a</p>', '<script>'],
    // Leading position matters: a `<style>` first in the string is parsed into
    // the head, where DOMPurify drops it without reporting it.
    ['a stylesheet', '<style>p{}</style><p>a</p>', '<style>'],
    ['a frame', '<iframe src="data:text/html,x"></iframe>', '<iframe>'],
    ['a form', '<form><p>a</p></form>', '<form>'],
    [
      'HTML smuggled into a drawing',
      '<svg><foreignObject><p>a</p></foreignObject></svg>',
      '<foreignobject>',
    ],
    [
      'an animation, which can rewrite an attribute',
      '<svg><a href="#x"><set attributeName="href" to="javascript:x()"/></a></svg>',
      '<set>',
    ],
    [
      'a moving drawing',
      '<svg><rect width="1" height="1"><animateTransform attributeName="transform" type="rotate"/></rect></svg>',
      '<animatetransform>',
    ],
    [
      'a script inside a drawing',
      '<svg><script>x()</script></svg>',
      '<script>',
    ],
    [
      'a drawing reusing something outside the page',
      '<svg><use href="http://x/y.svg#a"/></svg>',
      'href (sur <use>)',
    ],
    [
      'a paint that fetches',
      '<svg><rect fill="url(http://x/y.svg#g)"/></svg>',
      'fill (sur <rect>)',
    ],
    ['an event handler', '<p onclick="x()">a</p>', 'onclick (sur <p>)'],
    ['a remote link', '<a href="http://x">a</a>', 'href (sur <a>)'],
    ['a protocol-relative link', '<a href="//x/y">a</a>', 'href (sur <a>)'],
    ['a script URL', '<a href="javascript:x()">a</a>', 'href (sur <a>)'],
    // No network and no base URL: a relative image prints blank, so it is
    // refused rather than stored.
    ['a relative image', '<img src="logo.png">', 'src (sur <img>)'],
    [
      'a drawing reusing a relative file',
      '<svg><use href="seal.svg#a"/></svg>',
      'href (sur <use>)',
    ],
    [
      'a style that fetches',
      '<p style="color: red; background: url(http://x/y.png)">a</p>',
      'style (sur <p>)',
    ],
  ])('%s', (_label, bodyHtml, named) => {
    const { problems } = screen({ bodyHtml });

    expect(problems.join(' ')).toContain(named);
  });

  // What a refusal lists has to be what the author wrote, or the message sends
  // them looking for a tag that is not in their design.
  it('does not report what the parser added or a comment it dropped', () => {
    expect(screen({ bodyHtml: '<!-- note --><p>a</p>' }).problems).toEqual([]);
  });
});
