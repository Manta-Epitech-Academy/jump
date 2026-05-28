import type { ImageRightsDecision } from './imageRights';

/**
 * Shared predicates for stage-de-seconde dossier compliance. One module so
 * the cohort funnel, the per-event onboarding table, the per-student dossier
 * banner and the matching server filters in `$lib/server/db/stageCompliance`
 * never drift on what counts as "compliant".
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

/**
 * Image-rights compliance: a *settled* decision — `accepted` or `refused` —
 * counts as done. A refusal is the guardian acting, not a missing doc.
 */
export function isImageRightsCompliant(
  imageRightsDecision: ImageRightsDecision | null | undefined,
): boolean {
  return imageRightsDecision != null;
}
