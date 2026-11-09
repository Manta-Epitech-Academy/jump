/**
 * A disc cut into filled slices, one per part, clockwise from twelve o'clock.
 *
 * A part that is the whole disc has no slice to cut (an arc whose two ends meet
 * draws nothing), so it comes back with `path: null` and is drawn as a circle.
 * A part with no count draws nothing and is left out.
 */
export type PieSlice<T> = T & { path: string | null };

export function pieSlices<T extends { count: number }>(
  parts: readonly T[],
  { cx, cy, r }: { cx: number; cy: number; r: number },
): PieSlice<T>[] {
  const whole = parts.reduce((n, p) => n + p.count, 0);
  if (whole <= 0) return [];

  const point = (turn: number) => {
    const angle = turn * 2 * Math.PI - Math.PI / 2;
    return `${round(cx + r * Math.cos(angle))} ${round(cy + r * Math.sin(angle))}`;
  };

  let start = 0;
  const slices: PieSlice<T>[] = [];
  for (const part of parts) {
    if (part.count <= 0) continue;
    const share = part.count / whole;
    const end = start + share;
    const path =
      share >= 1
        ? null
        : `M ${cx} ${cy} L ${point(start)} A ${r} ${r} 0 ${share > 0.5 ? 1 : 0} 1 ${point(end)} Z`;
    slices.push({ ...part, path });
    start = end;
  }
  return slices;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
