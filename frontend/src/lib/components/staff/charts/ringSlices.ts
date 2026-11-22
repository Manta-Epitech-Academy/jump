/**
 * A whole cut into filled slices, one per part, clockwise from twelve o'clock:
 * slices of a disc when `inner` is 0, of a ring when it is not.
 *
 * Every part is a filled outline, never a dash along a stroked circle. A disc
 * stroked as wide as its diameter let the empty track show through a slice near
 * the centre (« Inscrits par genre », 29/10/2026). A ring stroked in dashes
 * notched its last part: a circle is a closed path that starts at twelve once
 * turned, the last dash ends exactly there, and the browser joins it to the
 * path's start at an angle it gets wrong: a notch on a thin part, on a Retina
 * screen and not on a laptop's plain one (« Inscrits par niveau », 1 Terminale
 * among 108, 22/11/2026, reproduced in Chromium).
 *
 * A part that is the whole is drawn as two half arcs, since an arc whose two
 * ends meet draws nothing. A part with no count draws nothing and is left out.
 */
export type RingSlice<T> = T & { path: string };

export type RingBox = {
  cx: number;
  cy: number;
  /** The outer radius. */
  r: number;
  /** The radius of the hole, 0 for a disc. */
  inner: number;
};

export function ringSlices<T extends { count: number }>(
  parts: readonly T[],
  box: RingBox,
): RingSlice<T>[] {
  const whole = parts.reduce((n, p) => n + p.count, 0);
  if (whole <= 0) return [];

  let start = 0;
  const slices: RingSlice<T>[] = [];
  for (const part of parts) {
    if (part.count <= 0) continue;
    const end = start + part.count / whole;
    slices.push({ ...part, path: sectorPath(start, end, box) });
    start = end;
  }
  return slices;
}

/**
 * The outline between two turns (0 is twelve o'clock, 1 a full turn), filled
 * by the nonzero rule: a whole ring's hole is traced the other way round.
 */
export function sectorPath(
  start: number,
  end: number,
  { cx, cy, r, inner }: RingBox,
): string {
  const point = (turn: number, radius: number) => {
    const angle = turn * 2 * Math.PI - Math.PI / 2;
    return `${round(cx + radius * Math.cos(angle))} ${round(cy + radius * Math.sin(angle))}`;
  };

  if (end - start >= 1) {
    const outer = `M ${point(0, r)} A ${r} ${r} 0 1 1 ${point(0.5, r)} A ${r} ${r} 0 1 1 ${point(0, r)} Z`;
    if (inner <= 0) return outer;
    return `${outer} M ${point(0, inner)} A ${inner} ${inner} 0 1 0 ${point(0.5, inner)} A ${inner} ${inner} 0 1 0 ${point(0, inner)} Z`;
  }

  const large = end - start > 0.5 ? 1 : 0;
  const rim = `A ${r} ${r} 0 ${large} 1 ${point(end, r)}`;
  if (inner <= 0) return `M ${cx} ${cy} L ${point(start, r)} ${rim} Z`;
  return `M ${point(start, r)} ${rim} L ${point(end, inner)} A ${inner} ${inner} 0 ${large} 0 ${point(start, inner)} Z`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
