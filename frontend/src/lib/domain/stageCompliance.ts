import type { ImageRightsStatus } from './imageRights';

/**
 * Shared predicates for stage-de-seconde dossier compliance. One module so
 * the cohort funnel, the per-event onboarding table and the per-student
 * dossier banner never drift on what counts as "compliant".
 *
 * Bare positional args (not a participation shape) so the predicates work
 * uniformly across the two call shapes that exist:
 *  - cohort view: many talents, the signal lives nested on each row's talent
 *  - per-student view: one talent, the signal is hoisted alongside the
 *    participation list
 * Callers extract the values; the predicates just own the truth.
 */

/**
 * Règlement intérieur compliance, with two signals in priority order:
 *  1. `parentRulesSignedAt` — the legal guardian co-signed online. Canonical
 *     authoritative proof.
 *  2. `charteSigned` — staff manually attested the offline equivalent
 *     (paper signature, in-person, etc).
 * Either signal satisfies the gate.
 */
export function isRulesCompliant(
  parentRulesSignedAt: Date | string | null | undefined,
  charteSigned: boolean | null | undefined,
): boolean {
  return parentRulesSignedAt != null || charteSigned === true;
}

/** The three display states a règlement intérieur signature can be in. */
export type RulesStatus = 'signed' | 'awaiting_parent' | 'pending';

/** UI labels (French) keyed by the resolved règlement status. */
export const RULES_STATUS_LABELS: Record<RulesStatus, string> = {
  signed: 'Signé',
  awaiting_parent: 'Attente parent',
  pending: 'En attente',
};

/**
 * Resolves the displayable règlement status from its three signals. Mirrors
 * {@link isRulesCompliant} for the "done" case, then splits the not-done case
 * into the actionable "chase the parent" state (student signed, guardian
 * co-signature still pending) versus "nothing signed yet". One definition so
 * the per-student rail and the cohort table never drift on the wording.
 */
export function rulesStatus(
  parentRulesSignedAt: Date | string | null | undefined,
  charteSigned: boolean | null | undefined,
  rulesSignedAt: Date | string | null | undefined,
): RulesStatus {
  if (isRulesCompliant(parentRulesSignedAt, charteSigned)) return 'signed';
  if (rulesSignedAt != null) return 'awaiting_parent';
  return 'pending';
}

/**
 * The inscrit's stage in the admission funnel, the single state the cohort badge
 * shows. Gated on connection first, then the two dossier gates (règlement
 * intérieur + droit à l'image): a student who never logged in is the most urgent
 * case and must read distinctly from one who connected but still owes documents.
 * One definition shared by the inscrits table, its statut filter and the XLSX
 * export so they never drift.
 */
export type InscritStatus = 'never_connected' | 'in_progress' | 'ready';

/**
 * UI labels (French) keyed by the funnel state. `never_connected` is the short
 * "Jamais" on purpose, so the pill and filter chip stay as compact as the other
 * two; the badge tooltip spells out the full "Jamais connecté".
 */
export const INSCRIT_STATUS_LABELS: Record<InscritStatus, string> = {
  never_connected: 'Jamais',
  in_progress: 'En cours',
  ready: 'Prêt',
};

/**
 * Folds connection + the two per-document statuses into the badge's three states:
 *  - `never_connected` — the talent never logged in (no real `bauth_session`).
 *                        Most urgent: nothing in the dossier can move until they
 *                        connect, so it reads red regardless of document state.
 *  - `ready`           — connected AND both gates done: règlement signed AND
 *                        image-rights decided.
 *  - `in_progress`     — connected but not both gates done. Subsumes the old
 *                        "partial" (some motion) and the connected slice of the
 *                        old "empty" (nothing signed yet).
 */
export function inscritStatus(
  connected: boolean,
  rules: RulesStatus,
  image: ImageRightsStatus,
): InscritStatus {
  if (!connected) return 'never_connected';
  if (rules === 'signed' && image !== 'undecided') return 'ready';
  return 'in_progress';
}
