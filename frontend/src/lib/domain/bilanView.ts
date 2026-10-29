import { defineListView, type SortedListView } from '$lib/domain/listView';

/**
 * The Feedback page's view, carried in its address, in the format every staff
 * list shares (`$lib/domain/listView`): a reload, a shared link, the
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

/** The sortable columns and their first-click direction: names
 *  alphabetically, the answer's date most recent first. */
export const BILAN_SORT_DEFAULT_DIR = {
  prenom: 'asc',
  nom: 'asc',
  date: 'desc',
} as const;

export type BilanSortKey = keyof typeof BILAN_SORT_DEFAULT_DIR;

export const BILAN_VIEW = defineListView({
  facets: BILAN_FACETS,
  // `nom` is the order the server already returns rows in.
  sort: { firstDir: BILAN_SORT_DEFAULT_DIR, defaultKey: 'nom' },
});

export type BilanView = SortedListView<BilanFacet, BilanSortKey>;
