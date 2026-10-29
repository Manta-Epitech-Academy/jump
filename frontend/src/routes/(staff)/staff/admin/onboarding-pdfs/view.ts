import { defineListChoice, defineListView } from '$lib/domain/listView';

/**
 * The PDF job feed's view, in the address every staff list shares
 * (`$lib/domain/listView`), read by the load and written by the page.
 *
 * - **`document`** (`rules`, `charter`, `image-rights`) filters from the
 *   Document column, counted in the database over every job.
 * - **`statut`** is the KPI tile pressed: `active` gathers the two transient
 *   states (pending, processing) the admin thinks of as "in flight". The bare
 *   address is every job.
 */

export const ONBOARDING_PDFS_FACETS = ['document'] as const;

export type OnboardingPdfsFacet = (typeof ONBOARDING_PDFS_FACETS)[number];

export const ONBOARDING_PDFS_VIEW = defineListView({
  facets: ONBOARDING_PDFS_FACETS,
});

export const ONBOARDING_DOCUMENT_LABELS: Record<string, string> = {
  rules: 'Règlement intérieur',
  charter: 'Charte',
  'image-rights': "Droit à l'image",
};

export const JOB_STATUS_FILTER = defineListChoice(
  'statut',
  ['all', 'active', 'success', 'error'] as const,
  'all',
);

export type JobStatusFilter = (typeof JOB_STATUS_FILTER.values)[number];
