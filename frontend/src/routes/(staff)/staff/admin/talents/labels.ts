/**
 * Client-safe labels + status types for the admin talents directory. Kept apart
 * from ./query because that module imports `$lib/server/*` (Prisma where
 * fragments) and so cannot be pulled into the browser bundle — the page badges
 * and the export both read these labels, so they live in this leaf module with
 * no server imports. Single-sourced so the table and the XLSX export agree.
 */

export type TalentAccountStatus = 'never' | 'pending' | 'active';
export type ParentCompletionStatus = 'complete' | 'pending';

/**
 * Account/onboarding status text. `active` reads "Onboardé" (the whole funnel
 * cleared), not "Actif" — the old word collided with "compte actif" (merely has
 * a login).
 */
export const TALENT_STATUS_LABELS: Record<TalentAccountStatus, string> = {
  active: 'Onboardé',
  pending: 'Onboarding',
  never: 'Jamais connecté',
};

/** Parent completion chip text. */
export const PARENT_STATUS_LABELS: Record<ParentCompletionStatus, string> = {
  complete: 'Complet',
  pending: 'En attente',
};
