/**
 * A staff list's view, carried in its address: the facets it filters on and
 * the column it sorts by. A reload, a link shared with a colleague, the
 * browser's Back button and a card that opens the list filtered all land on
 * the same list because they all read and write this one format. Search lives
 * in `?q`, through `createUrlSearch`, and the page in `?page`, through
 * `urlList`.
 *
 * The format, decided once here for every list:
 *
 * - **One param per facet, values comma-joined** (`?niveau=2nde,1ere`). Every
 *   value is an id or an enum key, never a label: a lycée or campus id, a
 *   niveau code, a status. None of them contains a comma.
 * - **`aucun` is the "not filled in" value** (`FACET_NONE`), for the facets a
 *   row can lack.
 * - **The default view writes nothing.** An empty facet drops its param, and so
 *   does the default sort, so the bare address is the unfiltered list.
 * - **Unknown params and values are ignored on read**, never an error: which
 *   values a facet still carries is the list's to say (`offerFacets`).
 *
 * A list declares its facets and, when it sorts, its sortable columns with the
 * direction a first click sorts them in; matching a row against the view
 * belongs to the list.
 */

export type SortDir = 'asc' | 'desc';

/** The sortable columns of a list, each with its first-click direction (XP
 *  high-to-low, names alphabetically), and the one the bare address sorts by. */
export type SortSpec<S extends string> = {
  firstDir: Record<S, SortDir>;
  /** The order the rows arrive in, so it writes no param. */
  defaultKey: NoInfer<S>;
};

export type FacetListView<F extends string> = {
  facets: Record<F, string[]>;
};

export type SortedListView<
  F extends string,
  S extends string,
> = FacetListView<F> & { sort: S; dir: SortDir };

type FacetAddress<F extends string> = {
  /** The facets, in the order the table shows their columns. */
  facets: readonly F[];
  /** The params one facet change writes, in the shape `setListParams` takes:
   *  an empty selection is `''`, which drops the param. */
  facetParams: (facet: F, values: readonly string[]) => Record<string, string>;
  /** The params that clear every facet, leaving the sort and the search. */
  clearedFacetParams: () => Record<string, string>;
};

export type FacetListAddress<F extends string> = FacetAddress<F> & {
  /** Read the view off a querystring. */
  parse: (params: URLSearchParams) => FacetListView<F>;
};

export type SortedListAddress<
  F extends string,
  S extends string,
> = FacetAddress<F> & {
  /** Read the view off a querystring. */
  parse: (params: URLSearchParams) => SortedListView<F, S>;
  /** The params a sort writes. The default sort writes none, and a direction
   *  is written only when it is not the column's first-click one. */
  sortParams: (sort: S, dir: SortDir) => Record<string, string>;
};

export function defineListView<F extends string, S extends string>(spec: {
  facets: readonly F[];
  sort: SortSpec<S>;
}): SortedListAddress<F, S>;
export function defineListView<F extends string>(spec: {
  facets: readonly F[];
}): FacetListAddress<F>;
export function defineListView<F extends string, S extends string>(spec: {
  facets: readonly F[];
  sort?: SortSpec<S>;
}): FacetListAddress<F> | SortedListAddress<F, S> {
  const { facets, sort } = spec;

  const address: FacetAddress<F> = {
    facets,
    facetParams: (facet, values) => ({
      [facet]: [...new Set(values)].join(','),
    }),
    clearedFacetParams: () =>
      Object.fromEntries(facets.map((facet) => [facet, ''])),
  };

  const parseFacets = (params: URLSearchParams) =>
    Object.fromEntries(
      facets.map((facet) => [facet, parseFacetValues(params.get(facet))]),
    ) as Record<F, string[]>;

  if (!sort) {
    return { ...address, parse: (params) => ({ facets: parseFacets(params) }) };
  }

  const isSortKey = (value: string | null): value is S =>
    value !== null && Object.hasOwn(sort.firstDir, value);

  return {
    ...address,
    parse(params) {
      const rawSort = params.get('sort');
      const key = isSortKey(rawSort) ? rawSort : sort.defaultKey;
      const rawDir = params.get('dir');
      const dir =
        rawDir === 'asc' || rawDir === 'desc' ? rawDir : sort.firstDir[key];
      return { facets: parseFacets(params), sort: key, dir };
    },
    sortParams(key, dir) {
      const isFirstDir = dir === sort.firstDir[key];
      return {
        sort: key === sort.defaultKey && isFirstDir ? '' : key,
        dir: isFirstDir ? '' : dir,
      };
    },
  };
}

/**
 * One choice a page owns outside its columns, a KPI tile pressed for instance:
 * one param, one value of a known set, read back as the default when absent or
 * unknown, and written as nothing when it is the default, like the rest of the
 * view.
 */
export type ListChoice<V extends string> = {
  param: string;
  values: readonly V[];
  defaultValue: V;
  parse: (params: URLSearchParams) => V;
  params: (value: V) => Record<string, string>;
};

export function defineListChoice<V extends string>(
  param: string,
  values: readonly V[],
  defaultValue: NoInfer<V>,
): ListChoice<V> {
  const isValue = (raw: string | null): raw is V =>
    raw !== null && (values as readonly string[]).includes(raw);
  return {
    param,
    values,
    defaultValue,
    parse: (params) => {
      const raw = params.get(param);
      return isValue(raw) ? raw : defaultValue;
    },
    params: (value) => ({ [param]: value === defaultValue ? '' : value }),
  };
}

/** A facet's values off its param: comma-split, trimmed, deduplicated. */
function parseFacetValues(raw: string | null): string[] {
  if (!raw) return [];
  const values = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set(values)];
}
