import { defineListView, type SortedListView } from '$lib/domain/listView';

/**
 * The Closings page's view, carried in its address, in the format every staff
 * list shares (`$lib/domain/listView`): a
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

/**
 * The sortable columns and the direction a first click sorts them in: names
 * alphabetically, the date most recent first. As on Inscrits, a column offers
 * one control: the others filter.
 */
export const CLOSINGS_SORT_DEFAULT_DIR = {
  prenom: 'asc',
  nom: 'asc',
  date: 'desc',
} as const;

export type ClosingsSortKey = keyof typeof CLOSINGS_SORT_DEFAULT_DIR;

export const CLOSINGS_VIEW = defineListView({
  facets: CLOSINGS_FACETS,
  // `nom` is the order the server already returns rows in.
  sort: { firstDir: CLOSINGS_SORT_DEFAULT_DIR, defaultKey: 'nom' },
});

export type ClosingsView = SortedListView<ClosingsFacet, ClosingsSortKey>;
