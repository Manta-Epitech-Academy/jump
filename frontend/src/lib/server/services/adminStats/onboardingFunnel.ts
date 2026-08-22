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
  type OnboardingStepFields,
} from '$lib/domain/talentOnboarding';
import { VISIBLE_PARTICIPATION_DEFINITION } from '$lib/domain/sfMemberStatus';
import { metric, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import {
  cohortWhere,
  dossierSchoolYear,
  onboardingCompleteWhere,
  scopeLabels,
} from './cohort';
import { onboardingEligibleWhere } from '$lib/server/db/onboardingEligibility';

const isSet = { not: null };

/**
 * "Blocked at this rung": every earlier step done, this one not. Mirrors
 * `getOnboardingStep`'s cascade exactly, including the `interests` rung being
 * backed by two timestamps (done only when both are set).
 *
 * Read against the projection alone, which only tells the truth for the year it
 * is stamped with - {@link rungWhere} adds that condition.
 */
/**
 * A rung's shape, expressed over the gate columns alone.
 *
 * Deliberately not `Prisma.TalentWhereInput`: the same shape has to filter the
 * projection AND a dossier row, and the two where-inputs are branded per model
 * even though the columns are identical. Narrowing to the gates keeps one
 * definition, and keeps a rung from quietly growing a condition on something
 * only one of the two carries.
 */
type GateFilter = {
  [K in keyof OnboardingStepFields]?: { not: null } | null;
};
type RungFilter = GateFilter & { OR?: GateFilter[] };

const RUNG_WHERE: Record<OnboardingStep, RungFilter> = {
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
  horsParcours: Metric;
  completed: Metric;
  inProgress: Metric;
  rungs: Metric<FunnelRung[]>;
};

/**
 * A rung, read off the dossier of `schoolYear` when the scope names one (see
 * `dossierSchoolYear`); off the projection as it stands otherwise.
 *
 * The rung shapes are reused verbatim in both readings, which is the payoff of
 * the dossier carrying the same column names as the projection it feeds.
 *
 * The first rung is the one that cannot be written as "that year's dossier, gate
 * unset", because a talent who has not started has no row for the year at all.
 * So it is stated the other way round: nobody whose dossier for the year has
 * cleared its first gate. That also catches the returning talent, whose flat
 * columns still hold last year's timestamps.
 */
function rungWhere(
  step: OnboardingStep,
  schoolYear: string | null,
): Prisma.TalentWhereInput {
  if (schoolYear == null) return RUNG_WHERE[step];
  if (step === ONBOARDING_STEP_ORDER[0]) {
    return {
      NOT: {
        onboardingRecords: {
          some: { schoolYear, infoValidatedAt: { not: null } },
        },
      },
    };
  }
  return { onboardingRecords: { some: { schoolYear, ...RUNG_WHERE[step] } } };
}

export async function getOnboardingFunnel(
  scope: Scope = {},
): Promise<OnboardingFunnel> {
  const scopeWhere = await cohortWhere(scope);
  const schoolYear = dossierSchoolYear(scope);
  // The whole funnel counts only the talents who walk the ladder. A collégien
  // never sets a single timestamp, so counted in they would sit on the first
  // rung for good and drag the completion rate down from the day Coding Clubs
  // come back - a figure that would read as a platform problem and is in fact
  // an artefact of who is in the denominator.
  const where: Prisma.TalentWhereInput = {
    AND: [scopeWhere, onboardingEligibleWhere],
  };

  const [scopeSize, cohort, completed, ...blockedCounts] = await Promise.all([
    prisma.talent.count({ where: scopeWhere }),
    prisma.talent.count({ where }),
    prisma.talent.count({
      where: { AND: [where, onboardingCompleteWhere(scope)] },
    }),
    ...ONBOARDING_STEP_ORDER.map((step) =>
      prisma.talent.count({
        where: { AND: [where, rungWhere(step, schoolYear)] },
      }),
    ),
  ]);

  const rungs: FunnelRung[] = ONBOARDING_STEP_ORDER.map((step, i) => ({
    step,
    label: ONBOARDING_STEP_LABELS[step],
    blocked: blockedCounts[i] ?? 0,
  }));

  return {
    filters: scopeLabels(scope),
    // One sentence, not one per scope: `cohortWhere` counts the same population
    // whether or not a filter was passed, so the definition no longer has to
    // branch to stay true (it used to say "tous les talents enregistrés dans
    // Jump" on an empty scope, which is what the short-circuit made it count).
    cohort: metric(
      cohort,
      `Talents inscrits à au moins un événement du périmètre, ${VISIBLE_PARTICIPATION_DEFINITION}, et concernés par le parcours d'inscription. Les collégiens en sont exclus : ils accèdent à Jump sans dossier, donc sans étape à franchir.`,
    ),
    horsParcours: metric(
      scopeSize - cohort,
      "Talents du périmètre non concernés par le parcours d'inscription : les collégiens. Ils ne figurent dans aucune étape ci-dessous. C'est l'écart entre la cohorte totale du périmètre et la cohorte de ce tableau.",
    ),
    completed: metric(
      completed,
      "Talents concernés ayant terminé l'intégralité du parcours d'inscription en ligne, Charte Informatique et Éthique acceptée comprise. Le dossier d'inscription est annuel : filtré sur une année scolaire, ce chiffre compte le dossier de cette année-là, et un talent revenu l'année suivante doit le refaire entièrement. Sans filtre d'année, il compte le dossier le plus récent de chaque talent.",
    ),
    inProgress: metric(
      cohort - completed,
      "Talents concernés qui n'ont pas fini leur parcours d'inscription : la somme des étapes bloquantes ci-dessous.",
    ),
    rungs: metric(
      rungs,
      "Pour chaque étape du parcours, le nombre de talents arrêtés dessus : toutes les étapes précédentes sont validées, celle-ci ne l'est pas. Un talent n'apparaît que dans une seule étape.",
    ),
  };
}
