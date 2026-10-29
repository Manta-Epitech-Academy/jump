import type { FacetDef } from '$lib/domain/listFacets';
import { defineListView } from '$lib/domain/listView';
import {
  SYNC_ERROR_KIND_LABELS,
  SYNC_ERROR_KINDS,
  type SyncErrorKind,
} from '$lib/domain/syncError';

/**
 * The sync-error queue's view, in the address every staff list shares
 * (`$lib/domain/listView`): what went wrong (`probleme`, a `SyncErrorKind`)
 * filters from the Problème column, the talent's name and the two dates sort.
 */

export const SYNC_ERRORS_FACETS = ['probleme'] as const;

export type SyncErrorsFacet = (typeof SYNC_ERRORS_FACETS)[number];

/** Oldest first by default: the error that has waited longest is the one to
 *  read first. The latest occurrence reads best most recent first. */
export const SYNC_ERRORS_SORT_DEFAULT_DIR = {
  talent: 'asc',
  since: 'asc',
  last: 'desc',
} as const;

export type SyncErrorsSortKey = keyof typeof SYNC_ERRORS_SORT_DEFAULT_DIR;

export const SYNC_ERRORS_VIEW = defineListView({
  facets: SYNC_ERRORS_FACETS,
  sort: { firstDir: SYNC_ERRORS_SORT_DEFAULT_DIR, defaultKey: 'since' },
});

export const SYNC_ERRORS_FACET_DEFS: Record<
  SyncErrorsFacet,
  FacetDef<{ kind: SyncErrorKind }>
> = {
  probleme: {
    title: 'Problème',
    valuesOf: (row) => [row.kind],
    vocabulary: () =>
      SYNC_ERROR_KINDS.map((k) => [k, SYNC_ERROR_KIND_LABELS[k]]),
  },
};
