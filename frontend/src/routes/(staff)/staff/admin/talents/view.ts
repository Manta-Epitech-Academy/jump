import { defineListView, type SortedListView } from '$lib/domain/listView';

/**
 * The talent directory's view, in the address every staff list shares
 * (`$lib/domain/listView`). Client-safe, unlike `./query`: the page reads it to
 * write its filters and sort, the server to read them back.
 *
 * Each facet filters from its column: the niveau (`niveau`, a `Niveau` code),
 * the campuses a talent has attended (`campus`, campus ids), the account's
 * onboarding state (`statut`, a `TalentAccountStatus`) and the parent's
 * (`parent`, a `ParentCompletionStatus`). The directory is paged on the server,
 * so it counts its facets there (`talentFacetCounts`), over the whole
 * directory, like every list counts its own.
 */

export const TALENTS_FACETS = ['niveau', 'campus', 'statut', 'parent'] as const;

export type TalentsFacet = (typeof TALENTS_FACETS)[number];

/** Names alphabetically, XP and the last activity highest first. The niveau
 *  filters instead of sorting: a column offers one control. */
export const TALENTS_SORT_DEFAULT_DIR = {
  nom: 'asc',
  xp: 'desc',
  activite: 'desc',
} as const;

export type TalentsSortKey = keyof typeof TALENTS_SORT_DEFAULT_DIR;

export const TALENTS_VIEW = defineListView({
  facets: TALENTS_FACETS,
  // The most recently active first: who an admin is likeliest to look for.
  sort: { firstDir: TALENTS_SORT_DEFAULT_DIR, defaultKey: 'activite' },
});

/** What narrows and orders the directory: its view, the search and the page. */
export type TalentFilters = SortedListView<TalentsFacet, TalentsSortKey> & {
  q: string;
  page: number;
};

/**
 * Parse the directory filters off the URL. Nothing in it can break the read:
 * an unknown param or sort is ignored, and a facet value the directory does
 * not carry is dropped by `resolveTalentFilters` before any query runs.
 */
export function parseTalentFilters(params: URLSearchParams): TalentFilters {
  return {
    ...TALENTS_VIEW.parse(params),
    q: params.get('q') || '',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}
