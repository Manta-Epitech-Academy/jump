/**
 * The brand fonts, as `@font-face` rules carrying their own bytes.
 *
 * Every PDF template used to pull its fonts from a Google Fonts `<link>`. The
 * renderer now blocks the network (see `infra/documentRenderer.ts`), so a remote
 * stylesheet would resolve to nothing and every document would print in
 * `ttf-freefont`, the only family the container actually has.
 *
 * The bytes come from the `@fontsource` packages that already ship in this repo,
 * imported with `?inline` so Vite resolves them to base64 at build time. `?raw`
 * would corrupt a binary; `fs.readFile` would work (the runtime image does copy
 * `node_modules`) but adds a path to get wrong in a container nobody can grep
 * from here.
 *
 * The RULES are written out below rather than read from each package's own
 * stylesheet, because a CSS import resolves to an empty string under SSR
 * whatever suffix it carries. That duplication is the one real risk here, and it
 * is covered rather than accepted: `fonts.test.ts` reads the packages from
 * `node_modules` and fails when a `unicode-range` here stops matching theirs.
 */

// Anton: display face, one weight. `layout.css` forbids ever bolding it.
import antonLatin from '@fontsource/anton/files/anton-latin-400-normal.woff2?inline';
import antonLatinExt from '@fontsource/anton/files/anton-latin-ext-400-normal.woff2?inline';
import antonVietnamese from '@fontsource/anton/files/anton-vietnamese-400-normal.woff2?inline';

// IBM Plex Sans: body face, variable weight axis, upright and italic.
import plexLatin from '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2?inline';
import plexLatinExt from '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-ext-wght-normal.woff2?inline';
import plexVietnamese from '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-vietnamese-wght-normal.woff2?inline';
import plexItalicLatin from '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-italic.woff2?inline';
import plexItalicLatinExt from '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-ext-wght-italic.woff2?inline';
import plexItalicVietnamese from '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-vietnamese-wght-italic.woff2?inline';

// Space Mono: the charte's third family, overlines and tech metadata.
import spaceMonoLatin400 from '@fontsource/space-mono/files/space-mono-latin-400-normal.woff2?inline';
import spaceMonoLatinExt400 from '@fontsource/space-mono/files/space-mono-latin-ext-400-normal.woff2?inline';
import spaceMonoLatin700 from '@fontsource/space-mono/files/space-mono-latin-700-normal.woff2?inline';
import spaceMonoLatinExt700 from '@fontsource/space-mono/files/space-mono-latin-ext-700-normal.woff2?inline';

// Dancing Script: the handwritten signature on the onboarding documents.
import dancingScriptLatin from '@fontsource/dancing-script/files/dancing-script-latin-600-normal.woff2?inline';
import dancingScriptLatinExt from '@fontsource/dancing-script/files/dancing-script-latin-ext-600-normal.woff2?inline';
import dancingScriptVietnamese from '@fontsource/dancing-script/files/dancing-script-vietnamese-600-normal.woff2?inline';

/**
 * Google's standard Latin subsets, byte-identical across all four packages
 * (asserted in `fonts.test.ts`).
 *
 * A range per subset is not decoration: two faces of one family with nothing to
 * separate them means the last rule wins for every glyph, so half the alphabet
 * falls back with nothing to show it happened.
 */
export const UNICODE_RANGES = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  vietnamese:
    'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
} as const;

export type UnicodeSubset = keyof typeof UNICODE_RANGES;

type Face = {
  family: string;
  style: 'normal' | 'italic';
  /** A single weight, or a variable axis range like `100 700`. */
  weight: string;
  /** `woff2-variations` for a variable axis, `woff2` for a static file. */
  format: 'woff2' | 'woff2-variations';
  subsets: Partial<Record<UnicodeSubset, string>>;
};

/**
 * `font-display: block` rather than fontsource's `swap`: `swap` paints a
 * fallback first, and while `documentRenderer` awaits `document.fonts.ready` before
 * printing, a face that never arrives should leave a gap rather than bake the
 * wrong family into a document somebody hands to a student.
 */
function rules(face: Face): string {
  return Object.entries(face.subsets)
    .map(
      ([subset, dataUri]) => `@font-face {
  font-family: '${face.family}';
  font-style: ${face.style};
  font-display: block;
  font-weight: ${face.weight};
  src: url('${dataUri}') format('${face.format}');
  unicode-range: ${UNICODE_RANGES[subset as UnicodeSubset]};
}`,
    )
    .join('\n');
}

/**
 * Which families carry the `vietnamese` subset: the ones that render a person's
 * NAME, because "Nguyễn" on a certificate is a realistic student and a fallback
 * glyph mid-name is glaring. Space Mono sets overlines and metadata, never a
 * name, so it stays at latin + latin-ext.
 */
const FONT_FACES = {
  anton: rules({
    family: 'Anton',
    style: 'normal',
    weight: '400',
    format: 'woff2',
    subsets: {
      latin: antonLatin,
      'latin-ext': antonLatinExt,
      vietnamese: antonVietnamese,
    },
  }),

  // Declared as `IBM Plex Sans`, not the `IBM Plex Sans Variable` the package
  // ships: every template asks for the Google Fonts spelling, and choosing it
  // here is what leaves all five of them untouched.
  plexSans: rules({
    family: 'IBM Plex Sans',
    style: 'normal',
    weight: '100 700',
    format: 'woff2-variations',
    subsets: {
      latin: plexLatin,
      'latin-ext': plexLatinExt,
      vietnamese: plexVietnamese,
    },
  }),

  plexSansItalic: rules({
    family: 'IBM Plex Sans',
    style: 'italic',
    weight: '100 700',
    format: 'woff2-variations',
    subsets: {
      latin: plexItalicLatin,
      'latin-ext': plexItalicLatinExt,
      vietnamese: plexItalicVietnamese,
    },
  }),

  spaceMono: [
    rules({
      family: 'Space Mono',
      style: 'normal',
      weight: '400',
      format: 'woff2',
      subsets: { latin: spaceMonoLatin400, 'latin-ext': spaceMonoLatinExt400 },
    }),
    rules({
      family: 'Space Mono',
      style: 'normal',
      weight: '700',
      format: 'woff2',
      subsets: { latin: spaceMonoLatin700, 'latin-ext': spaceMonoLatinExt700 },
    }),
  ].join('\n'),

  dancingScript: rules({
    family: 'Dancing Script',
    style: 'normal',
    weight: '600',
    format: 'woff2',
    subsets: {
      latin: dancingScriptLatin,
      'latin-ext': dancingScriptLatinExt,
      vietnamese: dancingScriptVietnamese,
    },
  }),
} as const;

export type BrandFont = keyof typeof FONT_FACES;

/**
 * The `@font-face` rules for exactly the families a document uses, to drop into
 * its `<style>`. Asked for per document rather than all at once: every family is
 * tens of kilobytes of base64, and a badge sheet has no use for a script face.
 */
export function fontFaceCss(...families: BrandFont[]): string {
  return families.map((family) => FONT_FACES[family]).join('\n');
}
