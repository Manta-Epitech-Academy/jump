import {
  clearedFacetParams,
  facetParam,
  parseFacetValues,
} from '$lib/domain/listFacets';

/**
 * The Feedback page's view, carried in its address, in the format every roster
 * list shares (`$lib/domain/listFacets`): a reload, a shared link, the
 * browser's Back button and the event home's recommendation card all land on
 * the same list. Search lives in `?q`, through `createUrlSearch`.
 *
 * The facets are the table's filtered columns: the recommendation picked
 * (`reco`, an option id, never its label, which is authored per form and can
 * change under a shared link; `aucun` for no answer to it) and whether the
 * talent answered (`reponse`: `responded`, `pending`).
 */

/** The facets, in the order the table shows their columns. */
export const BILAN_FACETS = ['reco', 'reponse'] as const;

export type BilanFacet = (typeof BILAN_FACETS)[number];

export type BilanSortDir = 'asc' | 'desc';

/** The sortable columns and their first-click direction: names
 *  alphabetically, the answer's date most recent first. */
export const BILAN_SORT_DEFAULT_DIR = {
  prenom: 'asc',
  nom: 'asc',
  date: 'desc',
} as const satisfies Record<string, BilanSortDir>;

export type BilanSortKey = keyof typeof BILAN_SORT_DEFAULT_DIR;

/** The order the server already returns rows in, so it writes no param. */
export const BILAN_DEFAULT_SORT: BilanSortKey = 'nom';

export type BilanView = {
  facets: Record<BilanFacet, string[]>;
  sort: BilanSortKey;
  dir: BilanSortDir;
};

function isSortKey(value: string | null): value is BilanSortKey {
  return value !== null && Object.hasOwn(BILAN_SORT_DEFAULT_DIR, value);
}

/** Read the view off a querystring. Unknown params and values are ignored. */
export function parseBilanView(params: URLSearchParams): BilanView {
  const facets = Object.fromEntries(
    BILAN_FACETS.map((f) => [f, parseFacetValues(params.get(f))]),
  ) as Record<BilanFacet, string[]>;
  const rawSort = params.get('sort');
  const sort = isSortKey(rawSort) ? rawSort : BILAN_DEFAULT_SORT;
  const rawDir = params.get('dir');
  const dir =
    rawDir === 'asc' || rawDir === 'desc'
      ? rawDir
      : BILAN_SORT_DEFAULT_DIR[sort];
  return { facets, sort, dir };
}

/** The params one facet change writes; an empty selection drops the param. */
export function bilanFacetParams(
  facet: BilanFacet,
  values: readonly string[],
): Record<string, string> {
  return { [facet]: facetParam(values) };
}

/** The params that clear every facet, leaving the sort and the search. */
export function bilanClearedFacetParams(): Record<string, string> {
  return clearedFacetParams(BILAN_FACETS);
}

/** The params a sort writes. The default sort writes none, and a direction is
 *  written only when it is not the column's first-click one. */
export function bilanSortParams(
  sort: BilanSortKey,
  dir: BilanSortDir,
): Record<string, string> {
  const isDefaultDir = dir === BILAN_SORT_DEFAULT_DIR[sort];
  return {
    sort: sort === BILAN_DEFAULT_SORT && isDefaultDir ? '' : sort,
    dir: isDefaultDir ? '' : dir,
  };
}
