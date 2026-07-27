/**
 * Where the onboarding funnel leaks: how many talents sit at each rung of the
 * canonical ladder, and how many have finished.
 *
 * Aggregates only, counted in SQL. The rung a talent is on is "the first step
 * whose timestamp is still null" (`getOnboardingStep`), so each rung here is
 * expressed as "every earlier timestamp set AND this one missing". The rungs are
 * walked from `ONBOARDING_STEP_ORDER`, so a step added to the ladder shows up as
 * a missing entry in `RUNG_WHERE` at type-check time rather than as a silently
 * uncounted bucket.
 *
 * No name, email or phone is ever selected here: this tier serves counts.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  ONBOARDING_STEP_ORDER,
  ONBOARDING_STEP_LABELS,
  type OnboardingStep,
} from '$lib/domain/talentOnboarding';
import { VISIBLE_PARTICIPATION_DEFINITION } from '$lib/domain/sfMemberStatus';
import { metric, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { cohortWhere, ONBOARDING_COMPLETE_WHERE, scopeLabels } from './cohort';

const isSet = { not: null };

/**
 * "Blocked at this rung": every earlier step done, this one not. Mirrors
 * `getOnboardingStep`'s cascade exactly, including the `interests` rung being
 * backed by two timestamps (done only when both are set).
 */
const RUNG_WHERE: Record<OnboardingStep, Prisma.TalentWhereInput> = {
  identity: { infoValidatedAt: null },
  school: { infoValidatedAt: isSet, highSchoolValidatedAt: null },
  parents: {
    infoValidatedAt: isSet,
    highSchoolValidatedAt: isSet,
    parentsValidatedAt: null,
  },
  interests: {
    infoValidatedAt: isSet,
    highSchoolValidatedAt: isSet,
    parentsValidatedAt: isSet,
    OR: [
      { techInterestsValidatedAt: null },
      { generalInterestsValidatedAt: null },
    ],
  },
  equipment: {
    infoValidatedAt: isSet,
    highSchoolValidatedAt: isSet,
    parentsValidatedAt: isSet,
    techInterestsValidatedAt: isSet,
    generalInterestsValidatedAt: isSet,
    equipmentValidatedAt: null,
  },
  processing: {
    infoValidatedAt: isSet,
    highSchoolValidatedAt: isSet,
    parentsValidatedAt: isSet,
    techInterestsValidatedAt: isSet,
    generalInterestsValidatedAt: isSet,
    equipmentValidatedAt: isSet,
    processingCompletedAt: null,
  },
  rules: {
    infoValidatedAt: isSet,
    highSchoolValidatedAt: isSet,
    parentsValidatedAt: isSet,
    techInterestsValidatedAt: isSet,
    generalInterestsValidatedAt: isSet,
    equipmentValidatedAt: isSet,
    processingCompletedAt: isSet,
    rulesSignedAt: null,
  },
};

export type FunnelRung = {
  step: OnboardingStep;
  label: string;
  blocked: number;
};

export type OnboardingFunnel = {
  filters: { event: string; campus: string; schoolYear: string };
  cohort: Metric;
  completed: Metric;
  inProgress: Metric;
  rungs: Metric<FunnelRung[]>;
};

export async function getOnboardingFunnel(
  scope: Scope = {},
): Promise<OnboardingFunnel> {
  const where = await cohortWhere(scope);

  const [cohort, completed, ...blockedCounts] = await Promise.all([
    prisma.talent.count({ where }),
    prisma.talent.count({
      where: { AND: [where, ONBOARDING_COMPLETE_WHERE] },
    }),
    ...ONBOARDING_STEP_ORDER.map((step) =>
      prisma.talent.count({ where: { AND: [where, RUNG_WHERE[step]] } }),
    ),
  ]);

  const rungs: FunnelRung[] = ONBOARDING_STEP_ORDER.map((step, i) => ({
    step,
    label: ONBOARDING_STEP_LABELS[step],
    blocked: blockedCounts[i] ?? 0,
  }));

  return {
    filters: scopeLabels(scope),
    cohort: metric(
      cohort,
      scope.event || scope.campus || scope.schoolYear
        ? `Talents du périmètre demandé, ${VISIBLE_PARTICIPATION_DEFINITION}.`
        : 'Tous les talents enregistrés dans Jump, tous événements confondus.',
    ),
    completed: metric(
      completed,
      "Talents ayant terminé l'intégralité du parcours d'inscription en ligne, charte de données acceptée comprise.",
    ),
    inProgress: metric(
      cohort - completed,
      "Talents du périmètre qui n'ont pas fini leur parcours d'inscription : la somme des étapes bloquantes ci-dessous.",
    ),
    rungs: metric(
      rungs,
      "Pour chaque étape du parcours, le nombre de talents arrêtés dessus : toutes les étapes précédentes sont validées, celle-ci ne l'est pas. Un talent n'apparaît que dans une seule étape.",
    ),
  };
}
