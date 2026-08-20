/**
 * The executable half of DESIGN.md.
 *
 * Two things are checked, and both are failures that already shipped once:
 * the contract drifting from its implementation, and a token pair that reads
 * fine to the person who picked it and fails WCAG AA. `--muted-foreground` sat
 * at 3.15:1 while carrying every label in the product; this file is what would
 * have caught it.
 */
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  cssVarName,
  loadContract,
  resolveToken,
} from './contract';

const { root, dark, declared } = loadContract();

/** A DESIGN.md name, minus the `dark` prefix, resolved in the dark scope. */
function darkCounterpart(name: string): string | null {
  const bare = name.slice(4);
  return resolveToken(
    cssVarName(bare[0].toLowerCase() + bare.slice(1)),
    dark,
    root,
  );
}

describe('design contract parity', () => {
  it('should declare at least the whole light palette', () => {
    // Arrange / Act
    const lightNames = Object.keys(declared).filter(
      (n) => !n.startsWith('dark'),
    );

    // Assert: a shrinking contract is the failure mode this guards against.
    expect(lightNames.length).toBeGreaterThanOrEqual(25);
  });

  it.each(
    Object.keys(declared)
      .filter((n) => !n.startsWith('dark'))
      .map((n) => [n, declared[n]] as const),
  )('should implement %s in layout.css :root', (name, expected) => {
    // Act
    const actual = resolveToken(cssVarName(name), root, root);

    // Assert
    expect(
      actual,
      `${cssVarName(name)} missing from layout.css`,
    ).not.toBeNull();
    expect(actual?.toLowerCase()).toBe(expected.toLowerCase());
  });

  it.each(
    Object.keys(declared)
      .filter((n) => n.startsWith('dark'))
      .map((n) => [n, declared[n]] as const),
  )('should implement %s in layout.css .dark', (name, expected) => {
    // Act
    const actual = darkCounterpart(name);

    // Assert
    expect(actual, `${name} unresolved in the .dark scope`).not.toBeNull();
    expect(actual?.toLowerCase()).toBe(expected.toLowerCase());
  });
});

/**
 * Every pair DESIGN.md's Colors tables put a number on. `min` is the floor the
 * pair has to clear, not the value it happens to have: 4.5 for text under 24px,
 * 3 for display text and for a UI border or icon.
 */
const PAIRS: ReadonlyArray<{
  readonly fg: string;
  readonly bg: string;
  readonly min: number;
  readonly why: string;
}> = [
  { fg: 'foreground', bg: 'card', min: 4.5, why: 'body text on a card' },
  {
    fg: 'foreground',
    bg: 'background',
    min: 4.5,
    why: 'body text on the page',
  },
  { fg: 'foregroundSecondary', bg: 'card', min: 4.5, why: 'secondary text' },
  {
    fg: 'foregroundSecondary',
    bg: 'background',
    min: 4.5,
    why: 'secondary text on the page',
  },
  { fg: 'mutedForeground', bg: 'card', min: 4.5, why: 'labels and captions' },
  {
    fg: 'mutedForeground',
    bg: 'background',
    min: 4.5,
    why: 'labels on the page',
  },
  { fg: 'primary', bg: 'card', min: 4.5, why: 'links and primary text' },
  {
    fg: 'primaryForeground',
    bg: 'primary',
    min: 4.5,
    why: 'primary button label',
  },
  {
    fg: 'destructiveForeground',
    bg: 'destructive',
    min: 4.5,
    why: 'destructive button label',
  },
  { fg: 'destructive', bg: 'card', min: 4.5, why: 'error text' },
  { fg: 'success', bg: 'card', min: 4.5, why: 'success text' },
  { fg: 'warning', bg: 'card', min: 4.5, why: 'warning text' },
  {
    fg: 'epiTechInk',
    bg: 'card',
    min: 4.5,
    why: 'the ink green, incl. the title cursor',
  },
  { fg: 'epiTogetherInk', bg: 'card', min: 4.5, why: 'the ink orange' },
  { fg: 'epiTomorrowInk', bg: 'card', min: 4.5, why: 'the ink magenta' },
  { fg: 'chromeForeground', bg: 'chrome', min: 4.5, why: 'sidebar text' },
  {
    fg: 'ring',
    bg: 'card',
    min: 3,
    why: 'focus outline against the surface it sits on',
  },
  { fg: 'epiTogether', bg: 'card', min: 3, why: 'raw accent as display text' },
  { fg: 'epiTomorrow', bg: 'card', min: 3, why: 'raw accent as display text' },
  {
    fg: 'epiTech',
    bg: 'primary',
    min: 3,
    why: 'the neon on brand blue, where it is allowed',
  },
  { fg: 'darkForeground', bg: 'darkCard', min: 4.5, why: 'body text, dark' },
  {
    fg: 'darkForegroundSecondary',
    bg: 'darkCard',
    min: 4.5,
    why: 'secondary text, dark',
  },
  { fg: 'darkMutedForeground', bg: 'darkCard', min: 4.5, why: 'labels, dark' },
  { fg: 'darkPrimary', bg: 'darkCard', min: 4.5, why: 'links and focus, dark' },
  {
    fg: 'darkForeground',
    bg: 'darkBackground',
    min: 4.5,
    why: 'body text on the dark page',
  },
];

describe('design contract contrast', () => {
  it.each(PAIRS.map((p) => [`${p.fg} on ${p.bg}`, p] as const))(
    'should clear its floor for %s',
    (_label, pair) => {
      // Arrange
      const fg = declared[pair.fg];
      const bg = declared[pair.bg];
      expect(fg, `${pair.fg} is not declared in DESIGN.md`).toBeDefined();
      expect(bg, `${pair.bg} is not declared in DESIGN.md`).toBeDefined();

      // Act
      const ratio = contrastRatio(fg, bg);

      // Assert
      expect(
        ratio,
        `${pair.why}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, floor ${pair.min}:1`,
      ).toBeGreaterThanOrEqual(pair.min);
    },
  );
});

describe('design contract palette discipline', () => {
  it('should keep the brand blue at one value across both themes', () => {
    // Arrange / Act: the wordmark is painted with it, so a per-theme
    // redefinition would put a non-brand blue in the logo.
    const light = resolveToken('--epi-blue', root, root);
    const inDark = resolveToken('--epi-blue', dark, root);

    // Assert
    expect(inDark).toBe(light);
  });

  it('should not leave an off-palette colour family in layout.css', () => {
    // Arrange
    const css = [...Object.values(root), ...Object.values(dark)].join(' ');

    // Act / Assert: every value is a hex, an rgb/rgba, a var() or a color-mix.
    expect(css).not.toMatch(
      /\b(slate|zinc|neutral|stone|amber|emerald|rose)\b/,
    );
  });
});
