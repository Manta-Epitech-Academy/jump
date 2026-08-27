/**
 * Accent-insensitive, token-AND matching for the in-memory staff lists.
 *
 * It exists because every roster had written its own `norm`, and one had not:
 * the bilan list matched on a bare `toLowerCase()`, so "Lea" found "Léa" on the
 * inscrits page and nowhere else. The three that did fold wrote the diacritic
 * class as literal combining characters in the source, which is invisible in an
 * editor and impossible to review.
 */

/**
 * Lowercase and strip diacritics, so a query typed without accents matches a
 * name stored with them (and the reverse). `\p{Diacritic}` rather than a hand
 * written codepoint range: it is the same set, spelled in characters a reviewer
 * can see.
 */
export function foldForSearch(value: string): string {
  return value
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * Split a query into folded tokens. Whitespace-separated and order-free, so
 * "dupont marie" and "marie dupont" both find the same row.
 */
export function searchTokens(query: string): string[] {
  return foldForSearch(query).split(/\s+/).filter(Boolean);
}

/**
 * Whether a row matches every token. Build the haystack with `buildHaystack`
 * (or fold it yourself) so both sides are in the same form; an empty token list
 * matches everything, which is what an empty search box means.
 */
export function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Fold the searchable fields of one row into a single haystack, dropping the
 * empty ones. Callers pass whichever fields their list searches on.
 */
export function buildHaystack(
  fields: readonly (string | null | undefined)[],
): string {
  return foldForSearch(fields.filter(Boolean).join(' '));
}
