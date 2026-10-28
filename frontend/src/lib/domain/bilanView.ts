/**
 * The Feedback page's view, carried in its address, in the format the Inscrits
 * page set (`$lib/domain/inscritsView`): a reload, a shared link, the browser's
 * Back button and the event home's recommendation card all land on the same
 * list. Search lives in `?q`, through `createUrlSearch`.
 *
 * - **`reponse`**: whether the talent answered (`responded`, `pending`).
 * - **`reco`**: the recommendation option picked, by its id, never its label: a
 *   label is authored per form and can be edited under a link already shared.
 *   `aucun` is a talent with no recommendation answer.
 *
 * An option id is the form's data, so this module cannot tell a stale one from
 * a live one: the page ignores an id its form does not carry, as Inscrits does
 * with a value its cohort does not carry. The default view writes nothing.
 */

/** The recommendation filter's value for a talent with no answer to it. */
export const BILAN_NO_RECO = 'aucun';

export type BilanResponseFilter = 'responded' | 'pending';

export type BilanSortDir = 'asc' | 'desc';

/** The sortable columns. Each opens ascending. */
export const BILAN_SORT_KEYS = [
  'prenom',
  'nom',
  'reco',
  'statut',
  'date',
] as const;

export type BilanSortKey = (typeof BILAN_SORT_KEYS)[number];

/** The order the server already returns rows in, so it writes no param. */
export const BILAN_DEFAULT_SORT: BilanSortKey = 'nom';

export type BilanView = {
  reponse: BilanResponseFilter | null;
  /** An option id, `BILAN_NO_RECO`, or null for every answer. */
  reco: string | null;
  sort: BilanSortKey;
  dir: BilanSortDir;
};

function isSortKey(value: string | null): value is BilanSortKey {
  return (
    value !== null && (BILAN_SORT_KEYS as readonly string[]).includes(value)
  );
}

/** Read the view off a querystring. Unknown params and values are ignored. */
export function parseBilanView(params: URLSearchParams): BilanView {
  const reponse = params.get('reponse');
  const sort = params.get('sort');
  return {
    reponse: reponse === 'responded' || reponse === 'pending' ? reponse : null,
    reco: params.get('reco')?.trim() || null,
    sort: isSortKey(sort) ? sort : BILAN_DEFAULT_SORT,
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  };
}

/**
 * The params a filter change writes, in the shape `setListParams` takes: a
 * filter set back to "all" is `''`, which drops the param.
 */
export function bilanFilterParams(filters: {
  reponse?: BilanResponseFilter | null;
  reco?: string | null;
}): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.reponse !== undefined) params.reponse = filters.reponse ?? '';
  if (filters.reco !== undefined) params.reco = filters.reco ?? '';
  return params;
}

/** The params a sort writes. The default sort writes none, and ascending, every
 *  column's first click, is never written. */
export function bilanSortParams(
  sort: BilanSortKey,
  dir: BilanSortDir,
): Record<string, string> {
  return {
    sort: sort === BILAN_DEFAULT_SORT && dir === 'asc' ? '' : sort,
    dir: dir === 'asc' ? '' : dir,
  };
}

/** Whether a row survives the view's filters. `knownReco` is the form's
 *  option ids: a `reco` outside them filters nothing. */
export function matchesBilanView(
  row: { respondedAt: string | null; recoOptionId: string | null },
  view: Pick<BilanView, 'reponse' | 'reco'>,
  knownReco: ReadonlySet<string>,
): boolean {
  if (view.reponse === 'responded' && !row.respondedAt) return false;
  if (view.reponse === 'pending' && row.respondedAt) return false;
  if (view.reco === BILAN_NO_RECO) return row.recoOptionId === null;
  if (view.reco && knownReco.has(view.reco))
    return row.recoOptionId === view.reco;
  return true;
}
