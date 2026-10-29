import type { FacetDef } from '$lib/domain/listFacets';
import { defineListView } from '$lib/domain/listView';
import { FORM_STATUS_OPTIONS } from '$lib/domain/feedbackForms/status';
import type { FormListRow } from './+page.server';

/**
 * The feedback-form list's view, in the address every staff list shares
 * (`$lib/domain/listView`): the form's lifecycle state (`statut`) filters from
 * the Statut column, the title, the counts and the last edit sort.
 */

export const FORMS_FACETS = ['statut'] as const;

export type FormsFacet = (typeof FORMS_FACETS)[number];

/** Titles alphabetically, the counts and the last edit highest first. */
export const FORMS_SORT_DEFAULT_DIR = {
  title: 'asc',
  questions: 'desc',
  responses: 'desc',
  updated: 'desc',
} as const;

export type FormsSortKey = keyof typeof FORMS_SORT_DEFAULT_DIR;

export const FORMS_VIEW = defineListView({
  facets: FORMS_FACETS,
  // The server's own order: the last edited first.
  sort: { firstDir: FORMS_SORT_DEFAULT_DIR, defaultKey: 'updated' },
});

export const FORMS_FACET_DEFS: Record<FormsFacet, FacetDef<FormListRow>> = {
  statut: {
    title: 'Statut',
    valuesOf: (r) => [r.status],
    vocabulary: () => FORM_STATUS_OPTIONS.map((o) => [o.value, o.label]),
  },
};
