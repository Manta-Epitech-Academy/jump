import { FACET_NONE } from '$lib/domain/listFacets';
import { defineListView, type SortedListView } from '$lib/domain/listView';

/**
 * The Inscrits page's view, carried in its address in the format every staff
 * list shares (`$lib/domain/listView`): a reload, a link shared with a
 * colleague, the browser's Back button and the event home's cards all land on
 * the same list. Matching a row against the view belongs to the page; this
 * module only declares what the address carries.
 */

/** The facets, in the order the table shows their columns. */
export const INSCRITS_FACETS = [
  'genre',
  'parcours',
  'tech',
  'lycee',
  'niveau',
  'statut',
] as const;

export type InscritsFacet = (typeof INSCRITS_FACETS)[number];

/** The facet value of a row that has none (no lycée, no answer...). */
export const INSCRITS_NONE = FACET_NONE;

/**
 * The sortable columns and the direction a first click sorts them in: XP reads
 * best high-to-low, names alphabetically. Only these three sort: as in the
 * mockup, a column offers one control, and the others (genre, parcours, lycée,
 * niveau, statut) filter instead.
 */
export const INSCRITS_SORT_DEFAULT_DIR = {
  prenom: 'asc',
  nom: 'asc',
  xp: 'desc',
} as const;

export type InscritsSortKey = keyof typeof INSCRITS_SORT_DEFAULT_DIR;

export const INSCRITS_VIEW = defineListView({
  facets: INSCRITS_FACETS,
  // `nom` is the order the server already returns rows in.
  sort: { firstDir: INSCRITS_SORT_DEFAULT_DIR, defaultKey: 'nom' },
});

export type InscritsView = SortedListView<InscritsFacet, InscritsSortKey>;
