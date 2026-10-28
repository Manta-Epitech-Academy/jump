import {
  clearedFacetParams,
  facetParam,
  parseFacetValues,
} from '$lib/domain/listFacets';

/**
 * The Closings page's view, carried in its address, in the format every roster
 * list shares (`$lib/domain/listFacets`, `inscritsView` its first user): a
 * reload, a shared link, the browser's Back button and the event home's cards
 * all land on the same list. Search lives in `?q`, through `createUrlSearch`.
 *
 * The facets are the mockup's header filters: who conducted the closing
 * (`mene`, a staff id or `aucun`), its state (`statut`), the team's verdict
 * (`avis`, a `ClosingRecommendation` or `aucun`). A verdict is a finalised
 * closing's (`closingVerdict`), so `avis=bon_profil` alone lists exactly the
 * closings the home's card counted; `avis=aucun` also holds every closing not
 * finalised yet, so the card's « Sans avis » writes `statut=done` beside it.
 */

/** The facets, in the order the table shows their columns. */
export const CLOSINGS_FACETS = ['mene', 'statut', 'avis'] as const;

export type ClosingsFacet = (typeof CLOSINGS_FACETS)[number];

export type ClosingsSortDir = 'asc' | 'desc';

/**
 * The sortable columns and the direction a first click sorts them in: names
 * alphabetically, the date most recent first. As on Inscrits, a column offers
 * one control: the others filter.
 */
export const CLOSINGS_SORT_DEFAULT_DIR = {
  prenom: 'asc',
  nom: 'asc',
  date: 'desc',
} as const satisfies Record<string, ClosingsSortDir>;

export type ClosingsSortKey = keyof typeof CLOSINGS_SORT_DEFAULT_DIR;

/** The order the server already returns rows in, so it writes no param. */
export const CLOSINGS_DEFAULT_SORT: ClosingsSortKey = 'nom';

export type ClosingsView = {
  facets: Record<ClosingsFacet, string[]>;
  sort: ClosingsSortKey;
  dir: ClosingsSortDir;
};

function isSortKey(value: string | null): value is ClosingsSortKey {
  return value !== null && Object.hasOwn(CLOSINGS_SORT_DEFAULT_DIR, value);
}

/** Read the view off a querystring. Unknown params and values are ignored. */
export function parseClosingsView(params: URLSearchParams): ClosingsView {
  const facets = Object.fromEntries(
    CLOSINGS_FACETS.map((f) => [f, parseFacetValues(params.get(f))]),
  ) as Record<ClosingsFacet, string[]>;
  const rawSort = params.get('sort');
  const sort = isSortKey(rawSort) ? rawSort : CLOSINGS_DEFAULT_SORT;
  const rawDir = params.get('dir');
  const dir =
    rawDir === 'asc' || rawDir === 'desc'
      ? rawDir
      : CLOSINGS_SORT_DEFAULT_DIR[sort];
  return { facets, sort, dir };
}

/** The params one facet change writes; an empty selection drops the param. */
export function closingsFacetParams(
  facet: ClosingsFacet,
  values: readonly string[],
): Record<string, string> {
  return { [facet]: facetParam(values) };
}

/** The params that clear every facet, leaving the sort and the search. */
export function closingsClearedFacetParams(): Record<string, string> {
  return clearedFacetParams(CLOSINGS_FACETS);
}

/** The params a sort writes. The default sort writes none, and a direction is
 *  written only when it is not the column's first-click one. */
export function closingsSortParams(
  sort: ClosingsSortKey,
  dir: ClosingsSortDir,
): Record<string, string> {
  const isDefaultDir = dir === CLOSINGS_SORT_DEFAULT_DIR[sort];
  return {
    sort: sort === CLOSINGS_DEFAULT_SORT && isDefaultDir ? '' : sort,
    dir: isDefaultDir ? '' : dir,
  };
}
