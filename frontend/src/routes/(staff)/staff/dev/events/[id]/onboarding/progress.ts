import type { ImageRightsDecision } from '$lib/domain/imageRights';

export type ParticipationProgress = {
  bringPc: boolean;
  stageCompliance: {
    charteSigned: boolean;
  } | null;
  // Image rights live on the talent (the guardian's authoritative online
  // decision), not on the per-participation compliance row. A settled decision
  // — `accepted` *or* `refused` — counts as done; only an absent decision is a
  // gap to chase.
  talent: {
    imageRightsDecision: ImageRightsDecision | null;
  };
};

/**
 * Number of *validation* documents tracked per participation. PC personnel
 * is intentionally excluded — bringing a laptop isn't a doc to sign, it's
 * a logistics signal (we just need to know how many laptops to prepare).
 * It surfaces as a separate KPI tile, not part of the readiness funnel.
 */
export const TOTAL_DOCS = 2;

export function countSignedDocs(p: ParticipationProgress): number {
  return (
    (p.stageCompliance?.charteSigned ? 1 : 0) +
    (p.talent.imageRightsDecision !== null ? 1 : 0)
  );
}

export function isReady(p: ParticipationProgress): boolean {
  return countSignedDocs(p) === TOTAL_DOCS;
}
