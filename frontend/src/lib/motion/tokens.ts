/**
 * DESIGN.md § Motion as numbers a Svelte transition can use.
 *
 * `routes/layout.css` declares the same values as custom properties for CSS
 * (`--dur-*`, `--motion-ease-standard`). A Svelte transition runs in
 * JavaScript and cannot read them, so they are restated here once, and
 * `lib/design/contract.test.ts` fails the moment the two disagree.
 */

/** Milliseconds. `fast` answers or leaves, `base` arrives, `slow` is the ceiling. */
export const DURATION = { fast: 120, base: 200, slow: 320 } as const;

/** Control points of `--motion-ease-standard`. */
export const EASE_STANDARD_POINTS = [0.2, 0, 0, 1] as const;

/**
 * A CSS `cubic-bezier()` as an easing function of progress `t` in [0, 1].
 *
 * Svelte's own easings are fixed curves (`cubicOut` and friends), and none of
 * them is the charte's. Solving the curve here is what lets a Svelte transition
 * and a CSS one share a token instead of looking almost alike. Newton's method
 * converges in a few steps on these curves; bisection catches the flat spots
 * where its slope vanishes.
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  function solveX(x: number): number {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < 1e-6) return s;
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    while (hi - lo > 1e-7) {
      const value = sampleX(s);
      if (Math.abs(value - x) < 1e-6) return s;
      if (value < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  }

  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solveX(t)));
}

export const easeStandard = cubicBezier(...EASE_STANDARD_POINTS);
