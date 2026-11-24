/**
 * One line out of several, always the same one for the same key. A line seen
 * often rotates so it does not wear out, but never at random: the server render
 * and the page would pick different ones. FNV-1a spreads short keys well enough.
 *
 * Shared by every voice that rotates its lines: the dev space's
 * (`devVoice.ts`) and EpiDuck's (`mascot.ts`).
 */
export function pickLine<T extends string>(
  lines: readonly T[],
  key: string,
): T {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return lines[(hash >>> 0) % lines.length];
}
