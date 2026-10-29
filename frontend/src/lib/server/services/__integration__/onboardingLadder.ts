import { prisma } from '$lib/server/db';
import { getOnboardingStep } from '$lib/domain/talentOnboarding';
import { patchCurrentOnboardingRecord } from '../onboardingYearService';

/**
 * Walks a talent's dossier for the year in progress up to the `rules` step, the
 * only one `signOnboardingRules` accepts a signature at.
 *
 * Shared because every suite that signs needs it and the gates are the ladder's,
 * not the suite's. The check at the end turns a step added to the ladder into a
 * failure that names this helper, rather than a refused signature surfacing as
 * an unrelated assertion several lines later in each suite.
 */
export async function reachRulesStep(
  talentId: string,
  at: Date = new Date(),
): Promise<void> {
  const dossier = await prisma.$transaction((tx) =>
    patchCurrentOnboardingRecord(tx, talentId, {
      infoValidatedAt: at,
      highSchoolValidatedAt: at,
      parentsValidatedAt: at,
      techInterestsValidatedAt: at,
      generalInterestsValidatedAt: at,
      equipmentValidatedAt: at,
      processingCompletedAt: at,
    }),
  );
  const step = getOnboardingStep(dossier);
  if (step !== 'rules') {
    throw new Error(
      `reachRulesStep left the dossier at '${step}': a gate is missing here`,
    );
  }
}
