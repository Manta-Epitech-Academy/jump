/**
 * The column filters of every staff list, once: what a filter offers, what it
 * keeps, and how it reads and writes the page address. Each list declares its
 * facets; the rules below are the same on all of them (the event's Inscrits,
 * Closings and Feedback, the admin directories), as a behaviour that differs
 * between two lists is a bug in one.
 *
 * - **A facet's values are the list's.** A value shows in a filter only when
 *   some row carries it, with how many do. The count is over the whole list,
 *   not over what the other filters left, so it reads the same however the list
 *   is narrowed: it describes the event, or the directory.
 * - **Several values of one facet widen, several facets narrow.** A row is kept
 *   when, for every active facet, it carries one of the values ticked.
 * - **A value the list does not carry is ignored**, so a stale or hand-edited
 *   address (an option deleted since the link was shared) filters on what still
 *   exists instead of emptying the list.
 * - **A facet whose list carries a single value keeps its column, with no
 *   filter**, since it could not narrow the list; its param is ignored.
 * - **In the address, one param per facet, values comma-joined**, ids or enum
 *   keys and never labels, `aucun` for "not filled in". The default view writes
 *   nothing (`$lib/domain/listView`).
 *
 * Who counts is the only thing that differs between lists. A list held whole
 * in memory counts its rows (`listFacets`, through `countFacet`); a list paged
 * on the server counts in the database and hands the counts to `offerFacets`.
 * Both end in `offerFacets`, so the rules above are never written twice.
 */

/** One value of a facet with how many rows carry it: what a filter menu lists,
 *  and what a card of the event home draws. */
export type FacetCount = { value: string; label: string; count: number };

/** The value of a row that has none (no lycée, no verdict, no answer...). */
export const FACET_NONE = 'aucun';

/** A facet as a list declares it. */
export type FacetDef<R> = {
  /** The column's label, and the chip's "Clé :". */
  title: string;
  /** The values one row carries; several for a multi-valued field. */
  valuesOf: (row: R) => string[];
  /** The facet's values with their labels, in the order the menu lists them,
   *  before the ones no row carries are dropped. */
  vocabulary: (rows: readonly R[]) => [string, string][];
};

/** One facet as the table offers it, with the values the view ticks in it. */
export type ListFacet<K extends string> = {
  facet: K;
  title: string;
  /** Empty when the facet cannot narrow the list (one value or none). */
  options: FacetCount[];
  /** The ticked values the roster carries (see "ignored" above). */
  selected: string[];
};

/** Every value of a facet the roster carries, with its count, in menu order.
 *  Keeps a facet of a single value: a card still has that one part to show. */
export function countFacet<R>(
  rows: readonly R[],
  def: FacetDef<R>,
): FacetCount[] {
  const counts = new Map<string, number>();
  for (const row of rows)
    for (const value of def.valuesOf(row))
      counts.set(value, (counts.get(value) ?? 0) + 1);
  return def
    .vocabulary(rows)
    .filter(([value]) => (counts.get(value) ?? 0) > 0)
    .map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 }));
}

/** The facets offered, each with its counted values and what the view ticks,
 *  for a list held whole in memory. */
export function listFacets<R, K extends string>(
  rows: readonly R[],
  defs: Record<K, FacetDef<R>>,
  keys: readonly K[],
  ticked: Record<K, readonly string[]>,
): ListFacet<K>[] {
  return offerFacets(
    keys.map((facet) => ({
      facet,
      title: defs[facet].title,
      counts: countFacet(rows, defs[facet]),
    })),
    ticked,
  );
}

/** One facet as counted, by the rows in memory or by the database: every
 *  value the list carries, with how many rows do, in menu order. */
export type CountedFacet<K extends string> = {
  facet: K;
  title: string;
  counts: FacetCount[];
};

/** The facets offered off their counts, with what the view ticks in each:
 *  where the rules above are applied, whoever counted. */
export function offerFacets<K extends string>(
  counted: readonly CountedFacet<K>[],
  ticked: Record<K, readonly string[]>,
): ListFacet<K>[] {
  return counted.map(({ facet, title, counts }) => {
    // A database count can name a value no row carries (a status bucket at
    // zero); the menu lists only what the list holds.
    const carried = counts.filter((c) => c.count > 0);
    // One value cannot narrow anything (every row has it), so such a facet is
    // not offered as a filter and its param is ignored.
    const options = carried.length > 1 ? carried : [];
    const offered = new Set(options.map((o) => o.value));
    return {
      facet,
      title,
      options,
      selected: ticked[facet].filter((v) => offered.has(v)),
    };
  });
}

/** Whether a row survives every active facet. */
export function matchesListFacets<R, K extends string>(
  row: R,
  facets: readonly ListFacet<K>[],
  defs: Record<K, FacetDef<R>>,
): boolean {
  return facets.every(
    ({ facet, selected }) =>
      selected.length === 0 ||
      defs[facet].valuesOf(row).some((v) => selected.includes(v)),
  );
}

/** "Most carried first, then by name", for an open vocabulary. */
export function byCount<R>(
  rows: readonly R[],
  valuesOf: (row: R) => [string, string][],
): [string, string][] {
  const tally = new Map<string, { label: string; count: number }>();
  for (const row of rows)
    for (const [value, label] of valuesOf(row)) {
      const entry = tally.get(value) ?? { label, count: 0 };
      entry.count += 1;
      tally.set(value, entry);
    }
  return [...tally.entries()]
    .sort(
      ([, a], [, b]) =>
        b.count - a.count || a.label.localeCompare(b.label, 'fr'),
    )
    .map(([value, { label }]) => [value, label]);
}

/** A facet's values off its param: comma-split, trimmed, deduplicated. */
export function parseFacetValues(raw: string | null): string[] {
  if (!raw) return [];
  const values = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

/** The param a facet's selection writes; `''` drops it (`setListParams`). */
export function facetParam(values: readonly string[]): string {
  return [...new Set(values)].join(',');
}

/** The params that clear every listed facet, leaving sort and search. */
export function clearedFacetParams(
  facets: readonly string[],
): Record<string, string> {
  return Object.fromEntries(facets.map((facet) => [facet, '']));
}
