/**
 * The font rules are written out in `fonts.ts` because a CSS import resolves to
 * an empty string under SSR, so they cannot be read from the @fontsource
 * packages at runtime. This is the test that keeps that duplication honest, plus
 * the invariants a wrong rule would break silently rather than loudly: a
 * document printing in a fallback face is not an error anybody sees.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fontFaceCss, UNICODE_RANGES, type UnicodeSubset } from './fonts';

/** The stylesheet each package ships, which is what our ranges must agree with. */
const PACKAGE_STYLESHEETS = {
  Anton: '@fontsource/anton/index.css',
  'Space Mono': '@fontsource/space-mono/index.css',
  'Dancing Script': '@fontsource/dancing-script/index.css',
  'IBM Plex Sans': '@fontsource-variable/ibm-plex-sans/wght.css',
} as const;

const FACE_BLOCK = /\/\*\s*([^*]+?)\s*\*\/\s*@font-face\s*\{(.*?)\}/gs;

/** subset name -> unicode-range, as the package itself declares them. */
function packageRanges(relativePath: string): Map<string, string> {
  const css = readFileSync(
    join(process.cwd(), 'node_modules', relativePath),
    'utf8',
  );
  const found = new Map<string, string>();
  for (const [, comment, body] of css.matchAll(FACE_BLOCK)) {
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim();
    if (!range) continue;
    for (const subset of ['latin-ext', 'vietnamese', 'latin'] as const) {
      // `latin-ext` before `latin`, or every ext block matches as latin.
      if (comment.includes(`-${subset}-`)) {
        found.set(subset, range);
        break;
      }
    }
  }
  return found;
}

describe('brand font faces', () => {
  it('carries its own bytes, so a blocked network cannot cost a document its font', () => {
    const css = fontFaceCss(
      'anton',
      'plexSans',
      'plexSansItalic',
      'spaceMono',
      'dancingScript',
    );
    expect(css).toContain('data:font/woff2;base64,');
    expect(css).not.toContain('./files/');
    expect(css).not.toContain('fonts.googleapis.com');
  });

  it('declares IBM Plex Sans under the name the templates ask for', () => {
    // The package ships it as "IBM Plex Sans Variable". Every PDF template says
    // "IBM Plex Sans", so this rename is what keeps them rendering.
    const css = fontFaceCss('plexSans');
    expect(css).toContain("font-family: 'IBM Plex Sans'");
    expect(css).not.toContain('IBM Plex Sans Variable');
  });

  it.each(Object.entries(PACKAGE_STYLESHEETS))(
    'agrees with what @fontsource declares for %s',
    (_family, relativePath) => {
      // The duplication guard. A package that re-subsets a family changes these
      // ranges, and a stale copy here would drop glyphs from a printed name.
      const declared = packageRanges(relativePath);
      expect(declared.size).toBeGreaterThan(0);
      for (const [subset, range] of declared) {
        expect(UNICODE_RANGES[subset as UnicodeSubset]).toBe(range);
      }
    },
  );

  it('gives every face a unicode-range', () => {
    // Two faces of one family with no range between them means the last rule
    // wins for every glyph, so latin-ext characters fall back without a trace.
    const css = fontFaceCss(
      'anton',
      'plexSans',
      'plexSansItalic',
      'spaceMono',
      'dancingScript',
    );
    const faces = css.match(/@font-face/g) ?? [];
    const ranges = css.match(/unicode-range:/g) ?? [];
    expect(faces.length).toBeGreaterThan(1);
    expect(ranges.length).toBe(faces.length);
  });

  it('covers a name outside latin-1 in every family that prints one', () => {
    // "Nguyễn" and "Wróblewski" are realistic students. Space Mono is excluded
    // on purpose: it sets overlines and metadata, never somebody's name.
    for (const family of ['anton', 'plexSans', 'dancingScript'] as const) {
      const css = fontFaceCss(family);
      expect(css, family).toContain(UNICODE_RANGES['latin-ext']);
      expect(css, family).toContain(UNICODE_RANGES.vietnamese);
    }
  });

  it('serves only the families asked for', () => {
    // Each one is tens of kilobytes of base64 in the document head.
    const badge = fontFaceCss('anton', 'plexSans');
    expect(badge).not.toContain('Dancing Script');
    expect(badge).not.toContain('Space Mono');
  });

  it('never leaves a font-display that would paint a fallback first', () => {
    const css = fontFaceCss('anton', 'plexSans', 'spaceMono', 'dancingScript');
    expect(css).not.toContain('font-display: swap');
    expect(css).toContain('font-display: block');
  });
});
