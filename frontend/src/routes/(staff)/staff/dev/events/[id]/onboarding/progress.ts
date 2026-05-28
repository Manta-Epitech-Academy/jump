import type { ImageRightsDecision } from '$lib/domain/imageRights';
import {
  isRulesCompliant as isRulesCompliantImpl,
  isImageRightsCompliant as isImageRightsCompliantImpl,
} from '$lib/domain/stageCompliance';

export type ParticipationProgress = {
  bringPc: boolean;
  stageCompliance: {
    charteSigned: boolean;
  } | null;
  // Talent-level facts the funnel reads:
  //  - `imageRightsDecision`: the guardian's authoritative online choice. A
  //    settled decision (`accepted` or `refused`) counts as done; only an
  //    absent decision is a gap to chase.
  //  - `parentRulesSignedAt`: the guardian's online co-signature of the
  //    règlement intérieur. Canonical "rules compliant" signal; the per-event
  //    `charteSigned` toggle stays as the offline-fallback attestation for
  //    families who didn't sign through the platform.
  talent: {
    imageRightsDecision: ImageRightsDecision | null;
    parentRulesSignedAt: Date | string | null;
  };
};

/**
 * Number of *validation* documents tracked per participation. PC personnel
 * is intentionally excluded: bringing a laptop isn't a doc to sign, it's
 * a logistics signal (we just need to know how many laptops to prepare).
 * It surfaces as a separate KPI tile, not part of the readiness funnel.
 */
export const TOTAL_DOCS = 2;

/**
 * Funnel-shaped wrappers around the domain predicates: they accept the
 * `ParticipationProgress` row directly so each call site stays concise.
 * The truth of "what counts as compliant" lives in `$lib/domain/stageCompliance`.
 */
export function isRulesCompliant(p: ParticipationProgress): boolean {
  return isRulesCompliantImpl(
    p.talent.parentRulesSignedAt,
    p.stageCompliance?.charteSigned,
  );
}

export function isImageRightsCompliant(p: ParticipationProgress): boolean {
  return isImageRightsCompliantImpl(p.talent.imageRightsDecision);
}

export function countSignedDocs(p: ParticipationProgress): number {
  return (isRulesCompliant(p) ? 1 : 0) + (isImageRightsCompliant(p) ? 1 : 0);
}

export function isReady(p: ParticipationProgress): boolean {
  return countSignedDocs(p) === TOTAL_DOCS;
}
