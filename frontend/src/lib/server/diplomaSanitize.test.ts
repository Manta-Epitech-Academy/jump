/**
 * The guard rails on a certificate design, at the unit level.
 *
 * Worth having separately from the integration test that drives the same code
 * through the write operation: that one proves a bad design is refused and
 * stored nowhere, which is the behaviour. These prove what the two passes
 * actually do to the bytes, which is where both of the bugs were. Neither is
 * visible from the outside, because a refusal and a sanitised value that never
 * gets stored look identical from the API.
 */

import { describe, it, expect } from 'vitest';
import {
  certificateProblems,
  sanitizeCertificateCss,
  sanitizeCertificateHtml,
} from './diplomaSanitize';

/** A design that has nothing wrong with it, to vary one field at a time from. */
const CLEAN = {
  styleCss: '.title { font-family: Anton, sans-serif }',
  bodyHtml: '<h1 class="title">{prenom} {nom}</h1>',
};

describe('what a stored stylesheet may contain', () => {
  // The stylesheet is emitted inside a `<style>` element, so a closing tag is the
  // whole trick: past it the rest of the design is parsed as markup in the head,
  // and a script tag there is a script tag. The tag checks used to run over
  // `bodyHtml` alone, so this was reported as having nothing wrong with it.
  it('refuses a closing tag, which is how a design leaves the style element', () => {
    const problems = certificateProblems({
      ...CLEAN,
      styleCss: '.a{}</style>',
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('<');
  });

  // The rule is one character rather than a list of tag names, so it cannot be
  // spelled around: no `<` means no tag of any kind, opening or closing.
  it('leaves nothing that can form a tag in the bytes it stores', () => {
    expect(sanitizeCertificateCss('.a{}</style>')).not.toContain('<');
  });

  // The other half of a one-character rule: it must not eat real CSS. A child
  // selector needs `>`, and a literal chevron has a CSS escape.
  it('accepts a child selector and an escaped chevron', () => {
    expect(
      certificateProblems({
        ...CLEAN,
        styleCss: '.a > .b { color: #000 } .c::after { content: "\\3C" }',
      }),
    ).toEqual([]);
  });

  it('still refuses what would fetch, in either field', () => {
    // Asserted on what the messages name rather than on how many there are: an
    // `@import` of a remote sheet breaks two separate rules, and the author is
    // told both, which is the point of refusing rather than only sanitising.
    const imported = certificateProblems({
      ...CLEAN,
      styleCss: "@import url('http://x/y')",
    }).join(' ');
    expect(imported).toContain('@import');
    expect(imported).toContain('url(...)');

    expect(
      certificateProblems({
        ...CLEAN,
        bodyHtml: '<p style="background: url(http://x/y.png)">a</p>',
      }).join(' '),
    ).toContain('url(...)');
  });
});

describe('what a stored body keeps', () => {
  // The authoring contract tells people to embed images as data URIs, and a data
  // URI carries a `;` of its own. Splitting the attribute on `;` to filter its
  // declarations rejoined the halves with a space, and Chrome then computed
  // `background-image: none`: an image silently absent from a printed document.
  it('leaves a data URI in an inline style byte for byte', () => {
    const html =
      '<div style="background: url(data:image/png;base64,iVBORw0KAAAA)">a</div>';

    expect(sanitizeCertificateHtml(html)).toBe(html);
  });

  // The whole attribute, not the offending declaration: a value only reaches the
  // sanitiser when the refusal above missed it, and dropping more is right there.
  it('drops an inline style attribute that would fetch, entirely', () => {
    const clean = sanitizeCertificateHtml(
      '<div style="color: red; background: url(http://x/y.png)">a</div>',
    );

    expect(clean).not.toContain('http://');
    expect(clean).not.toContain('style=');
  });
});
