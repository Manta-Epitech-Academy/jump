export type ParticipationProgress = {
  bringPc: boolean;
  stageCompliance: {
    charteSigned: boolean;
    conventionSigned: boolean;
    imageRightsSigned: boolean;
  } | null;
};

export const TOTAL_DOCS = 4;

export function countSignedDocs(p: ParticipationProgress): number {
  return (
    (p.stageCompliance?.charteSigned ? 1 : 0) +
    (p.stageCompliance?.conventionSigned ? 1 : 0) +
    (p.stageCompliance?.imageRightsSigned ? 1 : 0) +
    (p.bringPc ? 1 : 0)
  );
}

export function isReady(p: ParticipationProgress): boolean {
  return countSignedDocs(p) === TOTAL_DOCS;
}
