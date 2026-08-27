/**
 * The two agreement rules of a staff list's count line, kept out of
 * `DataTableToolbar.svelte` so they can be tested and so there is one place to
 * read them. Seven pages used to spell the second one out by hand, and two of
 * the seven got it wrong: the émargement roster pluralised a single result, and
 * the notes gallery never said "au total".
 */

/** "1 talent", "12 talents". `plural` defaults to the noun plus an s. */
export function countNounForm(
  count: number,
  noun: string,
  plural?: string,
): string {
  return count > 1 ? (plural ?? `${noun}s`) : noun;
}

/**
 * Trailing sentence after the noun. `undefined` means the count stands alone,
 * which is what a list with nothing to filter wants.
 */
export function countFilterSuffix(
  count: number,
  filtersApplied: boolean | undefined,
): string | undefined {
  if (filtersApplied === undefined) return undefined;
  if (!filtersApplied) return 'au total';
  return count > 1 ? 'correspondent aux filtres' : 'correspond aux filtres';
}
