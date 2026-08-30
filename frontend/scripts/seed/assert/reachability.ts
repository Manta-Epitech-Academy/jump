/**
 * States the application can reach, checked with the application's own logic.
 *
 * The generator writes rows; these functions are what the product actually calls
 * to interpret them. Running the real `getOnboardingStep`, `imageRightsStance`
 * and `eventRunsClosings` over the result is what turns "we wrote some
 * timestamps" into "every rung of the ladder is standing on".
 *
 * It is also the honest answer to a design constraint: the services cannot be
 * called from here, because they reach `$lib/server/db` and `$env/dynamic/private`
 * which do not resolve outside Vite. The pure domain functions have no such
 * dependency, so the check uses the same code the screens do.
 */

import type { PrismaClient } from '@prisma/client';
import {
  ONBOARDING_STEP_ORDER,
  getOnboardingStep,
  type OnboardingStep,
} from '../../../src/lib/domain/talentOnboarding';
import {
  imageRightsStance,
  imageRightsStatus,
} from '../../../src/lib/domain/imageRights';
import { eventRunsClosings } from '../../../src/lib/domain/eventModules';

export async function reachabilityFailures(
  prisma: PrismaClient,
): Promise<string[]> {
  const failures: string[] = [];

  // Every rung of the ladder, plus "finished". Production holds three talents
  // stopped part-way out of 887, so this is the check that would otherwise be
  // impossible to satisfy from realistic volume alone.
  const dossiers = await prisma.onboarding_Record.findMany({
    where: { talentId: { startsWith: 'sd_' } },
    select: {
      infoValidatedAt: true,
      highSchoolValidatedAt: true,
      parentsValidatedAt: true,
      techInterestsValidatedAt: true,
      generalInterestsValidatedAt: true,
      equipmentValidatedAt: true,
      processingCompletedAt: true,
      rulesSignedAt: true,
    },
  });
  const stepsSeen = new Set<OnboardingStep | 'complete'>();
  for (const dossier of dossiers)
    stepsSeen.add(getOnboardingStep(dossier) ?? 'complete');
  for (const step of ONBOARDING_STEP_ORDER) {
    if (!stepsSeen.has(step))
      failures.push(`Aucun dossier arrêté à l'étape « ${step} »`);
  }
  if (!stepsSeen.has('complete')) failures.push('Aucun dossier terminé');

  // The three stances. A lapsed authorisation must read `unknown`, never
  // `authorized`; a lapsed refusal must still read `forbidden`. Reading the
  // projection alone collapses the two, and the marker silently drops off a
  // refused student's badge every September.
  const talents = await prisma.talent.findMany({
    where: { id: { startsWith: 'sd_' } },
    select: {
      id: true,
      imageRightsDecision: true,
      imageRightsDecidedAt: true,
      imageRightsRecords: {
        orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: { decision: true },
      },
    },
  });
  const stances = new Set<string>();
  for (const talent of talents) {
    stances.add(
      imageRightsStance(
        imageRightsStatus(talent),
        talent.imageRightsRecords[0]?.decision ?? null,
      ),
    );
  }
  for (const expected of ['authorized', 'forbidden', 'unknown']) {
    if (!stances.has(expected))
      failures.push(
        `Aucun talent en position « ${expected} » pour le droit à l'image`,
      );
  }

  // An event that runs closings and one that does not. A coverage rate whose
  // denominator is taken over the whole périmètre instead of over the events
  // that actually run them read 18% where it should have read 78%, and nothing
  // could catch it without both cases being present.
  const events = await prisma.event.findMany({
    where: { id: { startsWith: 'sd_' } },
    select: {
      id: true,
      closingTemplateId: true,
      feedbackFormId: true,
      modules: { select: { moduleKey: true } },
    },
  });
  const gates = events.map((event) => ({
    modules: event.modules.map((module) => module.moduleKey),
    hasPlanning: false,
    hasFeedbackForm: event.feedbackFormId !== null,
    hasClosingTemplate: event.closingTemplateId !== null,
  }));
  if (!gates.some((gate) => eventRunsClosings(gate)))
    failures.push('Aucun événement ne conduit de closings');
  if (!gates.some((gate) => !eventRunsClosings(gate)))
    failures.push('Tous les événements conduisent des closings');

  // A talent can only sign in when the mirror's address and the login address
  // agree; the app refuses otherwise, and a seed gets this wrong silently.
  const mismatched = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "Talent" t
    JOIN "TalentSfImport" s ON s."talentId" = t."id"
    JOIN "bauth_user" u ON u."id" = t."userId"
    WHERE t."id" LIKE 'sd_%' AND lower(s."sfEmail") <> lower(u."email")
  `;
  if ((mismatched[0]?.count ?? 0) > 0) {
    failures.push(
      `${mismatched[0]!.count} talents dont l'adresse CRM et l'adresse de connexion divergent`,
    );
  }

  return failures;
}
