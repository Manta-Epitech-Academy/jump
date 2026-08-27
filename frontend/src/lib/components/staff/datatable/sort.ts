import type { ColumnDef, SortDir } from './types';

/**
 * The two sorting rules every staff list shares, and which nine pages had each
 * written out for themselves.
 */

/**
 * Where a header click lands: same column flips the direction, a new column
 * opens in its declared `defaultSortDir` (or ascending).
 *
 * The generic key is a convenience with a real justification: `ColumnDef.key` is
 * a `string`, while a page narrows its sort state to a union of its own column
 * keys, so every call site used to end in `key as SortKey`. The cast lives here
 * once instead, and it holds as long as the sort state and the columns handed in
 * describe the same table, which is the only way either is ever used.
 *
 * Six of the nine copies this replaces ignored `defaultSortDir` entirely, so the
 * field documented on `ColumnDef` did nothing on their tables.
 */
export function nextSort<K extends string>(
  columns: readonly ColumnDef[],
  current: { key: K | null; dir: SortDir },
  clicked: string,
): { key: K; dir: SortDir } {
  if (current.key === clicked) {
    return { key: clicked as K, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  const column = columns.find((c) => c.key === clicked);
  return { key: clicked as K, dir: column?.defaultSortDir ?? 'asc' };
}

/**
 * A comparator for `Array.prototype.sort`, applying the direction and sinking
 * the rows with no value for the active column.
 *
 * `isMissing` sits OUTSIDE the direction flip on purpose: sorting by Lycée
 * should surface the rows that have one, never lead with a block of "—", in
 * either direction. Two rosters stated that rule in a comment and then broke it
 * by folding the missing case into a `-dir` / `dir` return, so reversing the
 * sort floated the empty rows to the top. `compare` therefore only ever sees
 * rows that both have a value.
 */
export function rowComparator<T>({
  compare,
  dir,
  isMissing,
}: {
  compare: (a: T, b: T) => number;
  dir: SortDir;
  /** Omit for a column whose value is always present. */
  isMissing?: (row: T) => boolean;
}): (a: T, b: T) => number {
  return (a, b) => {
    if (isMissing) {
      const aMissing = isMissing(a);
      const bMissing = isMissing(b);
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (aMissing && bMissing) return 0;
    }
    const c = compare(a, b);
    return dir === 'asc' ? c : -c;
  };
}
