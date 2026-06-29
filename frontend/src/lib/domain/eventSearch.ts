/**
 * Matching helpers for the dev event switcher's search box. Pure and
 * accent-insensitive, so a French query types naturally ("fevrier" finds
 * "février", "special" finds "spécial") and a row stays findable by more than
 * its visible name (its Salesforce campaign titre, its date, its school year).
 */

/** Lowercase + strip diacritics, so accented and bare spellings match. */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Relevance of an (already folded) query against a row's folded haystack
 * fields. 0 means no field matched; higher is a better hit. A prefix beats a
 * word-start beats a mid-word match, so "cod" surfaces "Coding Club" above an
 * event that merely contains the letters somewhere inside another word.
 */
export function matchScore(query: string, fields: string[]): number {
  let best = 0;
  for (const f of fields) {
    const i = f.indexOf(query);
    if (i < 0) continue;
    const score = i === 0 ? 3 : /[\s\-/]/.test(f[i - 1]!) ? 2 : 1;
    if (score > best) best = score;
  }
  return best;
}
