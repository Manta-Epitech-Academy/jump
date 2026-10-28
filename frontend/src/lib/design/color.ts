/**
 * Colour arithmetic, pure so a component can run it as well as a test.
 *
 * It sat in `contract.ts`, which reads `DESIGN.md` and `layout.css` off the disk
 * and so can never reach a browser. A colour the team authors at runtime (an
 * event category's) still owes the reader legible text, and only the code that
 * paints it knows which colour it is: the same WCAG formula has to run there.
 */

/** WCAG 2.x relative luminance. Accepts `#rgb` and `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two opaque colours. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * The two inks text can take on a fill the code did not choose: white, and the
 * brand's near-black (`--epi-dark`, which `contract.test.ts` holds to this
 * value). Neither follows the theme, because the fill does not either.
 */
export const FILL_INKS = { light: '#ffffff', dark: '#181818' } as const;

export type FillInk = keyof typeof FILL_INKS;

/**
 * The ink that reads best on `fill`: whichever of the two clears the higher
 * contrast. Run on the four brand accents it gives white on `#013afb` and the
 * near-black on the other three, which is what the 2027 mockup paints by hand.
 */
export function inkOn(fill: string): FillInk {
  return contrastRatio(FILL_INKS.light, fill) >=
    contrastRatio(FILL_INKS.dark, fill)
    ? 'light'
    : 'dark';
}
