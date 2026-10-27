/**
 * The Inscrits page's view, carried in its address: the facets it filters on
 * and the column it sorts by. A reload, a link shared with a colleague, the
 * browser's Back button and the event home's cards all land on the same list
 * because they all read and write this one format. Search lives in `?q`,
 * through `createUrlSearch`, like every other staff list.
 *
 * The format, decided once here:
 *
 * - **One param per facet, values comma-joined** (`?niveau=2nde,1ere`), the
 *   shape `?campus=` already has on the admin directories. Every value is an id
 *   or an enum key, never a label: an id, a niveau code, a closing state, a
 *   reco option id. None of them contains a comma.
 * - **`aucun` is the "not filled in" value**, for the facets a talent can lack
 *   (no lycée, no niveau, no answer).
 * - **The default view writes nothing.** An empty facet drops its param, and so
 *   does the default sort, so the bare address is the unfiltered list.
 *
 * Matching a row against the view belongs to the page; this module only owns
 * the address.
 */

/** The facets, in the order the table shows their columns. */
export const INSCRITS_FACETS = [
  'genre',
  'parcours',
  'tech',
  'perso',
  'lycee',
  'niveau',
  'statut',
  'closing',
  'reco',
] as const;

export type InscritsFacet = (typeof INSCRITS_FACETS)[number];

/** The facet value of a row that has none (no lycée, no answer...). */
export const INSCRITS_NONE = 'aucun';

export type InscritsSortDir = 'asc' | 'desc';

/**
 * The sortable columns and the direction a first click sorts them in: XP and
 * parcours read best high-to-low, the rest alphabetically.
 */
export const INSCRITS_SORT_DEFAULT_DIR = {
  prenom: 'asc',
  nom: 'asc',
  xp: 'desc',
  parcours: 'desc',
  lycee: 'asc',
  niveau: 'asc',
  status: 'asc',
} as const satisfies Record<string, InscritsSortDir>;

export type InscritsSortKey = keyof typeof INSCRITS_SORT_DEFAULT_DIR;

/** The order the server already returns rows in, so it writes no param. */
export const INSCRITS_DEFAULT_SORT: InscritsSortKey = 'nom';

export type InscritsView = {
  facets: Record<InscritsFacet, string[]>;
  sort: InscritsSortKey;
  dir: InscritsSortDir;
};

function isSortKey(value: string | null): value is InscritsSortKey {
  return value !== null && Object.hasOwn(INSCRITS_SORT_DEFAULT_DIR, value);
}

function parseFacet(raw: string | null): string[] {
  if (!raw) return [];
  const values = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

/** Read the view off a querystring. Unknown params and values are ignored. */
export function parseInscritsView(params: URLSearchParams): InscritsView {
  const facets = Object.fromEntries(
    INSCRITS_FACETS.map((facet) => [facet, parseFacet(params.get(facet))]),
  ) as Record<InscritsFacet, string[]>;
  const rawSort = params.get('sort');
  const sort = isSortKey(rawSort) ? rawSort : INSCRITS_DEFAULT_SORT;
  const rawDir = params.get('dir');
  const dir =
    rawDir === 'asc' || rawDir === 'desc'
      ? rawDir
      : INSCRITS_SORT_DEFAULT_DIR[sort];
  return { facets, sort, dir };
}

/**
 * The params one facet change writes, in the shape `setListParams` takes: an
 * empty selection is `''`, which drops the param.
 */
export function inscritsFacetParams(
  facet: InscritsFacet,
  values: readonly string[],
): Record<string, string> {
  return { [facet]: [...new Set(values)].join(',') };
}

/** The params that clear every facet, leaving the sort and the search. */
export function inscritsClearedFacetParams(): Record<string, string> {
  return Object.fromEntries(INSCRITS_FACETS.map((facet) => [facet, '']));
}

/**
 * The params a sort writes. The default sort writes none, and a direction is
 * written only when it is not the column's first-click one.
 */
export function inscritsSortParams(
  sort: InscritsSortKey,
  dir: InscritsSortDir,
): Record<string, string> {
  const isDefaultDir = dir === INSCRITS_SORT_DEFAULT_DIR[sort];
  return {
    sort: sort === INSCRITS_DEFAULT_SORT && isDefaultDir ? '' : sort,
    dir: isDefaultDir ? '' : dir,
  };
}
