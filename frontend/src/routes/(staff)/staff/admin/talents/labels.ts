/**
 * Client-safe labels + status types for the admin talents directory. Kept apart
 * from ./query because that module imports `$lib/server/*` (Prisma where
 * fragments) and so cannot be pulled into the browser bundle — the page badges
 * and the export both read these labels, so they live in this leaf module with
 * no server imports. Single-sourced so the table and the XLSX export agree.
 */

export type TalentAccountStatus = 'never' | 'pending' | 'active' | 'no_dossier';
export type ParentCompletionStatus = 'complete' | 'pending';

/**
 * Account/onboarding status text. `active` reads "Onboardé" (the whole funnel
 * cleared), not "Actif" — the old word collided with "compte actif" (merely has
 * a login).
 *
 * `no_dossier` is a collégien, who has no onboarding to do. The chip says only
 * "Pas de dossier": the Niveau column sits on the same row and already says
 * which level, so repeating "(collégien)" in the chip spends width on something
 * the row shows. The full wording lives in the chip's tooltip.
 */
export const TALENT_STATUS_LABELS: Record<TalentAccountStatus, string> = {
  active: 'Onboardé',
  pending: 'Onboarding',
  never: 'Jamais connecté',
  no_dossier: 'Pas de dossier',
};

/** Tooltip for the one chip whose label deliberately omits its reason. */
export const NO_DOSSIER_HINT =
  "Collégien : pas de parcours d'inscription sur Jump.";

/** Parent completion chip text. */
export const PARENT_STATUS_LABELS: Record<ParentCompletionStatus, string> = {
  complete: 'Complet',
  pending: 'En attente',
};
