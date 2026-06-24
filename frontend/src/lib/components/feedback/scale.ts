const FACES = ['🤩', '🙂', '😐', '😕'];
const COLORS = ['#00ff97', '#14b8a6', '#94a3b8', '#ff5f3a'];

/**
 * Returns an emoji face mapped to the position `i` within a scale of `n` levels.
 * Index 0 = best, n-1 = worst.
 */
export function scaleEmoji(i: number, n: number): string {
  // A single-level scale has no spread to map onto; `i / (n - 1)` would be NaN
  // and the lookup `undefined`, rendering the literal text "undefined".
  if (n <= 1) return FACES[0];
  const idx = Math.round((i / (n - 1)) * (FACES.length - 1));
  return FACES[idx];
}

/**
 * Returns a hex color mapped to the position `i` within a scale of `n` levels.
 * Index 0 = best (green), n-1 = worst (orange).
 */
export function scaleLevelColor(i: number, n: number): string {
  if (n <= 1) return COLORS[0];
  const idx = Math.round((i / (n - 1)) * (COLORS.length - 1));
  return COLORS[idx];
}
