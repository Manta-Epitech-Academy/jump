import type { ClosingRecommendation } from '@prisma/client';
import {
  isClosingRecommendation,
  type ClosingListStatus,
} from '$lib/domain/closing';
import type { ClosingRow } from '$lib/domain/closingsRoster';

/**
 * The Closings page's view, carried in its address, in the format the Inscrits
 * page set (`$lib/domain/inscritsView`): a reload, a shared link, the browser's
 * Back button and the event home's cards all land on the same list. Search
 * lives in `?q`, through `createUrlSearch`.
 *
 * - **`statut`**: the closing's state (`todo`, `in_progress`, `done`).
 * - **`avis`**: the team's verdict, a `ClosingRecommendation` or `aucun` for a
 *   closing that carries none. The home counts a verdict only once its closing
 *   is finalised, so its links write `statut=done` beside it and the list shows
 *   exactly the closings the card counted.
 *
 * Each filter holds one value, the one its `FilterSelect` picks. The default
 * view writes nothing, so the bare address is the whole roster by nom.
 */

/** The verdict filter's value for a closing without one. */
export const CLOSINGS_NO_VERDICT = 'aucun';

export type ClosingsVerdictFilter =
  ClosingRecommendation | typeof CLOSINGS_NO_VERDICT;

export type ClosingsSortDir = 'asc' | 'desc';

/** The sortable columns. Each opens ascending, which floats the talents still
 *  to call up on Statut. */
export const CLOSINGS_SORT_KEYS = [
  'prenom',
  'nom',
  'staff',
  'date',
  'status',
] as const;

export type ClosingsSortKey = (typeof CLOSINGS_SORT_KEYS)[number];

/** The order the server already returns rows in, so it writes no param. */
export const CLOSINGS_DEFAULT_SORT: ClosingsSortKey = 'nom';

export type ClosingsView = {
  statut: ClosingListStatus | null;
  avis: ClosingsVerdictFilter | null;
  sort: ClosingsSortKey;
  dir: ClosingsSortDir;
};

const STATUSES: readonly ClosingListStatus[] = ['todo', 'in_progress', 'done'];

function isStatus(value: string | null): value is ClosingListStatus {
  return value !== null && (STATUSES as readonly string[]).includes(value);
}

function isVerdictFilter(value: string | null): value is ClosingsVerdictFilter {
  return (
    value !== null &&
    (value === CLOSINGS_NO_VERDICT || isClosingRecommendation(value))
  );
}

function isSortKey(value: string | null): value is ClosingsSortKey {
  return (
    value !== null && (CLOSINGS_SORT_KEYS as readonly string[]).includes(value)
  );
}

/** Read the view off a querystring. Unknown params and values are ignored. */
export function parseClosingsView(params: URLSearchParams): ClosingsView {
  const statut = params.get('statut');
  const avis = params.get('avis');
  const sort = params.get('sort');
  return {
    statut: isStatus(statut) ? statut : null,
    avis: isVerdictFilter(avis) ? avis : null,
    sort: isSortKey(sort) ? sort : CLOSINGS_DEFAULT_SORT,
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  };
}

/**
 * The params a filter change writes, in the shape `setListParams` takes: a
 * filter set back to "all" is `''`, which drops the param.
 */
export function closingsFilterParams(filters: {
  statut?: ClosingListStatus | null;
  avis?: ClosingsVerdictFilter | null;
}): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.statut !== undefined) params.statut = filters.statut ?? '';
  if (filters.avis !== undefined) params.avis = filters.avis ?? '';
  return params;
}

/** The params a sort writes. The default sort writes none, and ascending, every
 *  column's first click, is never written. */
export function closingsSortParams(
  sort: ClosingsSortKey,
  dir: ClosingsSortDir,
): Record<string, string> {
  return {
    sort: sort === CLOSINGS_DEFAULT_SORT && dir === 'asc' ? '' : sort,
    dir: dir === 'asc' ? '' : dir,
  };
}

/** Whether a row survives the view's filters. */
export function matchesClosingsView(
  row: Pick<ClosingRow, 'status' | 'recommendation'>,
  view: Pick<ClosingsView, 'statut' | 'avis'>,
): boolean {
  if (view.statut && row.status !== view.statut) return false;
  if (view.avis === null) return true;
  return view.avis === CLOSINGS_NO_VERDICT
    ? row.recommendation === null
    : row.recommendation === view.avis;
}
