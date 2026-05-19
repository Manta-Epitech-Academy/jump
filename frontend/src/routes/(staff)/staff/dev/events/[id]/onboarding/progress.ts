export type ParticipationProgress = {
  bringPc: boolean;
  stageCompliance: {
    charteSigned: boolean;
    imageRightsSigned: boolean;
  } | null;
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
    (p.stageCompliance?.imageRightsSigned ? 1 : 0)
  );
}

export function isReady(p: ParticipationProgress): boolean {
  return countSignedDocs(p) === TOTAL_DOCS;
}
