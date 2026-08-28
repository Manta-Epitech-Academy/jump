/**
 * Which features of Jump are actually used, and by whom.
 *
 * The gap this closes is the one the whole `Usage_*` model was built for: Jump
 * could say who was enrolled, who had signed and who was present, and nothing
 * about which of its own screens anybody opened. So a feature nobody used looked
 * exactly like a feature nobody had asked about, and both looked like a feature
 * in daily use.
 *
 * Four reading rules this file exists to hold in one place.
 *
 * THE WINDOW DECIDES THE SOURCE, and both sources give one figure. Anything
 * inside the raw retention window is counted from `Usage_FeatureUse`, anything
 * older from the actor-free `Usage_FeatureMonthly`. A caller never picks: they
 * name a number of days and `source` says which side answered. Both go through
 * `usage/read.ts`, which is what keeps the two from being two different figures
 * under one name. This paragraph used to describe an intention rather than the
 * code: every read hit the raw table, and a window past retention returned
 * whatever had not been purged yet while announcing it came from the cube.
 *
 * A DISTINCT ACTOR IS COUNTED PER MONTH. The talent pseudonym rotates monthly,
 * so a set accumulated over a window counts one person once per month they were
 * active, and a share computed from it can pass 100 %. The reported figure is
 * therefore the busiest month's count, folded once in `usage/read.ts`.
 *
 * THE YEAR FILTER IS A DATE RANGE. Usage rows carry a campus and sometimes an
 * event, never a school year, so `schoolYearBounds` turns the label into bounds
 * on `occurredAt`. Deriving the year from the events in scope instead would work
 * for the event-scoped features and silently drop every campus-scoped one.
 *
 * IMPERSONATED USE IS NOT ADOPTION. An admin exploring a campus is excluded
 * everywhere here. The flag stays on the raw row for the staff activity view,
 * which asks a different question.
 */

import { prisma } from '$lib/server/db';
import {
  USAGE_FEATURE_DEFS,
  USAGE_FEATURE_KEYS,
  USAGE_MEASURED_ELSEWHERE,
  type UsageAudience,
  type UsageFeatureKey,
  type UsageSpace,
} from '$lib/domain/usage';
import {
  metric,
  rank,
  rankAxisNote,
  RANK_UNITS,
  share,
  variation,
  variationRule,
  type Metric,
  type Ranked,
  type Variation,
} from '$lib/server/adminApi/metrics';
import { OperationRefusedError } from '$lib/server/adminApi/errors';
import type { Scope } from '$lib/server/adminApi/scope';
import {
  foldByFeature,
  foldByFeatureCampus,
  readCubeTallies,
  readTallies,
  usageSourceMetric,
  usageWindowFor,
  type FeatureTotals,
  type MonthlyTally,
  type UsageSource,
  type UsageWindow,
} from '$lib/server/usage/read';
import {
  completeMonths,
  monthsCovering,
  shiftMonth,
} from '$lib/server/usage/months';
import { scopedEvents, scopeLabels } from './cohort';

const FEATURE_AXIS_NOTE = rankAxisNote(RANK_UNITS.feature);
const CAMPUS_AXIS_NOTE = rankAxisNote(RANK_UNITS.campus);

/** How far back the year-on-year comparison looks, in months. */
const COMPARISON_LAG_MONTHS = 12;
const COMPARISON_LABEL = 'la même période un an plus tôt';

/**
 * The disclosure floor on a NARROWED talent cell.
 *
 * 869 talents have ever logged in, spread over fifteen campuses, so a per-campus
 * average near sixty and some campuses far smaller. A cell reading "2 talents de
 * Lille ont ouvert l'historique d'XP" is not a statistic about a cohort, it is
 * almost a statement about two named children, even under a pseudonym, to a
 * reader who knows the campus. So a talent cell below this floor comes back
 * masked.
 *
 * Zero is NOT masked, and that is deliberate: a zero discloses nobody, and "this
 * campus has never used it" is the single most actionable answer this operation
 * produces. Masking it would hide exactly what the feature is for.
 *
 * Staff cells are never masked. They are adults, employees, the measurement is
 * of professional tool use, and per-person staff history is what was asked for.
 *
 * WHAT MAKES A CELL A CELL IS THE NARROWING, NOT THE WORD "CAMPUS", and reading
 * that too literally is how the same hole shipped twice. The floor first sat at
 * one call site inside the coverage matrix while `stats_feature_usage` took the
 * same `campus` filter and answered unmasked; it then keyed on the campus filter
 * alone while that operation also takes `eventId`, which is narrower still. An
 * event names one campus, one date and a roster a dev can read by name, so a
 * question it isolates earns the floor a fortiori. The test to apply before
 * adding any filter to a talent-bearing read: can it narrow the count below the
 * whole platform? Then it goes through {@link maskCell}.
 */
export const USAGE_SMALL_CELL_FLOOR = 5;

const MASKED_CELL_RULE =
  `Pour les fonctionnalités côté talent, le nombre d'acteurs distincts est masqué (null) en dessous de ${USAGE_SMALL_CELL_FLOOR} dès que la question porte sur un seul campus ou sur un seul événement, ` +
  `car sur un périmètre aussi étroit un compte de 1 ou 2 désignerait presque des personnes. Un zéro n'est jamais masqué : il ne désigne personne et c'est la réponse la plus utile. La part de la population est masquée avec lui, sinon elle le redonnerait.`;

const IMPERSONATION_RULE =
  "Les consultations faites par un administrateur en exploration d'un campus sont exclues : un administrateur qui regarde n'est pas un campus qui adopte.";

const MONTHLY_ACTOR_RULE =
  "Un acteur distinct se compte par mois calendaire, jamais cumulé sur plusieurs mois : le pseudonyme d'un talent change chaque mois, donc cumuler compterait trois fois quelqu'un actif trois mois et pourrait dépasser la population. Les identifiants d'un membre de l'équipe ne tournent pas, mais la règle s'applique des deux côtés pour que le chiffre veuille dire la même chose partout.";

const PEAK_RULE = `« acteursDistinctsMoisDePointe » est le nombre de personnes distinctes du mois calendaire où elles ont été les plus nombreuses, et « moisDePointe » nomme ce mois. C'est un maximum mensuel et non un cumul. ${MONTHLY_ACTOR_RULE} Un maximum mensuel se lit de la même façon sur une fenêtre de 7 jours et sur une de 365, ne peut pas dépasser la population d'un mois, et vaut zéro exactement quand personne n'a utilisé la fonctionnalité sur toute la période.`;

const LAST_MONTH_RULE =
  "« dernierMoisUtilise » donne le dernier mois où la fonctionnalité a servi, au mois et non au jour : au-delà de la conservation des lignes détaillées la date exacte n'existe plus, et une réponse ne doit pas être plus précise selon la période demandée.";

/** Which store answered, re-exported so consumers of this module have the type. */
export type { UsageSource };

export type FeatureRow = {
  feature: UsageFeatureKey;
  libelle: string;
  definition: string;
  audience: UsageAudience;
  espace: UsageSpace;
  utilisations: number;
  /** The busiest month's distinct actors; null when masked by the floor. */
  acteursDistinctsMoisDePointe: number | null;
  moisDePointe: string | null;
  /** Share of the population that could have used it; null when unmeasurable. */
  partDeLaPopulation: number | null;
  dernierMoisUtilise: string | null;
  /** Movement against the same months a year earlier. Null when not comparable. */
  evolutionUtilisations: Variation | null;
};

export type FeatureComparison = {
  feature: UsageFeatureKey;
  periode: string[];
  periodeReference: string[];
  utilisations: Metric<Variation>;
  acteursDistinctsMoisDePointe: Metric<Variation>;
  partDeLaPopulation: Metric<Variation>;
};

export type FeatureUsage = {
  filters: {
    schoolYear: string;
    campus: string;
    event: string;
    audience: string;
    espace: string;
    jours: number | null;
  };
  source: Metric<UsageSource>;
  populationConcernee: Metric<{ staff: number; talents: number }>;
  fonctionnalites: Metric<Ranked<FeatureRow>[]>;
  evolution: Metric<{ periode: string[]; periodeReference: string[] } | null>;
  comparaison: FeatureComparison | null;
  dejaMesureAilleurs: Metric<Readonly<Record<string, string>>>;
};

export type UsageFilters = {
  audience?: UsageAudience;
  space?: UsageSpace;
  days?: number;
  feature?: UsageFeatureKey;
};

/**
 * The features a filter set selects, from the catalogue rather than from the
 * data. Asking the data which features exist would answer "the ones already
 * used", and the whole point is to name the ones that are not.
 */
function selectedFeatures(filters: UsageFilters): UsageFeatureKey[] {
  return USAGE_FEATURE_KEYS.filter((key) => {
    const def = USAGE_FEATURE_DEFS[key];
    if (filters.feature && key !== filters.feature) return false;
    if (filters.audience && def.audience !== filters.audience) return false;
    if (filters.space && def.space !== filters.space) return false;
    return true;
  });
}

/**
 * The denominator: who could have used the thing at all.
 *
 * Staff for a staff feature, talents who have ever logged in for a talent one.
 * "Ever logged in" and not "exists": 84 % of talent rows have never opened Jump,
 * so dividing by every row would make every adoption rate read as a failure of
 * the feature when it is a failure to arrive.
 */
async function population(
  scope: Scope,
): Promise<{ staff: number; talents: number }> {
  const campusId = scope.campus?.id;
  const [staff, talents] = await Promise.all([
    prisma.staffProfile.count({
      where: {
        staffRole: { not: null },
        ...(campusId ? { campusId } : {}),
      },
    }),
    prisma.talent.count({
      where: {
        firstLoginAt: { not: null },
        ...(campusId ? { participations: { some: { campusId } } } : {}),
      },
    }),
  ]);
  return { staff, talents };
}

/**
 * The disclosure floor, in one place.
 *
 * `narrowed` is what makes a cell a cell: a national figure over every campus
 * discloses nobody, the same figure narrowed to one campus, or to one event,
 * can. See {@link USAGE_SMALL_CELL_FLOOR} for why the second belongs here.
 */
function maskCell(
  key: UsageFeatureKey,
  actors: number,
  narrowed: boolean,
): number | null {
  if (!narrowed) return actors;
  if (USAGE_FEATURE_DEFS[key].audience !== 'talent') return actors;
  if (actors === 0) return 0;
  return actors < USAGE_SMALL_CELL_FLOOR ? null : actors;
}

/**
 * The day count to narrow by, or none.
 *
 * A named school year IS the window, so a default day count must not be
 * substituted on top of it: doing that turned "quelle adoption en 2025-2026"
 * into "les 30 derniers jours vus à travers 2025-2026", which for any past year
 * is empty. The default applies only when no year was named.
 */
function windowDays(scope: Scope, days: number | undefined, fallback: number) {
  if (days !== undefined) return days;
  return scope.schoolYear ? undefined : fallback;
}

const EMPTY_TOTALS: FeatureTotals = {
  uses: 0,
  peakActors: 0,
  peakMonth: null,
  lastMonth: null,
};

/** Fold a window's cells for one campus only. */
function foldForCampus(
  tallies: MonthlyTally[],
  campusId: string,
): Map<string, FeatureTotals> {
  return foldByFeature(tallies.filter((t) => t.campusId === campusId));
}

/**
 * The months a window covers, and the same months a year earlier.
 *
 * Only COMPLETE months compare. The month in progress is folded into the cube
 * only as far as the last rollup run and the cron is weekly, so setting it
 * against a whole month a year ago would report a decline that is an artefact of
 * the schedule. The row's own `utilisations` still includes it, which is why the
 * definition says the compared value is not the displayed one.
 */
function comparisonMonths(
  window: UsageWindow,
  now: Date,
): { periode: string[]; periodeReference: string[] } | null {
  const months = window.months ?? monthsCovering(window.from, window.to);
  const periode = completeMonths(months, now);
  if (periode.length === 0) return null;
  return {
    periode,
    periodeReference: periode.map((m) => shiftMonth(m, -COMPARISON_LAG_MONTHS)),
  };
}

/**
 * Per-feature adoption over a window, ranked by distinct actors.
 *
 * Ranked on actors and not on uses, deliberately: a single person hammering one
 * export all week is not adoption, and "how many people reach for this" is the
 * question a retire-or-invest decision turns on.
 */
export async function getFeatureUsage(
  scope: Scope = {},
  filters: UsageFilters = {},
  now: Date = new Date(),
): Promise<FeatureUsage> {
  // Called for its year assertion, not for its events: this is where an unknown
  // school year becomes a refusal instead of an empty window, which is the
  // tier's rule that an unknown scope is never a zero. `resolveScope` already
  // covers the campus and the event id; the year is asserted here, by the same
  // shared helper every other aggregate uses, so the three cannot disagree about
  // which years exist.
  await scopedEvents(scope);
  const days = windowDays(scope, filters.days, 30);
  const features = selectedFeatures(filters);
  const window = usageWindowFor(scope, days, now);
  assertEventReadable(window, scope);

  const [pop, read, comparison] = await Promise.all([
    population(scope),
    readTallies({
      features,
      window,
      campusId: scope.campus?.id ?? null,
      eventId: scope.event?.id ?? null,
    }),
    readComparison(features, window, scope, now),
  ]);

  const totals = foldByFeature(read.tallies);
  // An event, not only a campus: `eventId` narrows a talent count harder than
  // `campus` does, so keying the floor on the campus filter alone left the same
  // disclosure one parameter away.
  const narrowed = Boolean(scope.campus || scope.event);

  const rows: FeatureRow[] = features.map((key) => {
    const def = USAGE_FEATURE_DEFS[key];
    const t = totals.get(key) ?? EMPTY_TOTALS;
    const actors = maskCell(key, t.peakActors, narrowed);
    const base = def.audience === 'staff' ? pop.staff : pop.talents;
    return {
      feature: key,
      libelle: def.label,
      definition: def.definition,
      audience: def.audience,
      espace: def.space,
      utilisations: t.uses,
      acteursDistinctsMoisDePointe: actors,
      moisDePointe: actors === null ? null : t.peakMonth,
      // Masked with the count, or the share would hand it straight back.
      partDeLaPopulation: actors === null ? null : share(actors, base),
      dernierMoisUtilise: t.lastMonth,
      evolutionUtilisations: comparison
        ? variation(
            comparison.current.get(key)?.uses ?? 0,
            comparison.previousFor(key),
            'count',
            COMPARISON_LABEL,
          ).value
        : null,
    };
  });

  return {
    filters: {
      ...scopeLabels(scope),
      audience: filters.audience ?? 'toutes',
      espace: filters.space ?? 'tous',
      jours: days ?? null,
    },
    source: usageSourceMetric(window, read.computedAt),
    populationConcernee: metric(
      pop,
      "Le dénominateur de chaque part : les membres de l'équipe ayant un rôle pour une fonctionnalité staff, et les talents s'étant déjà connectés au moins une fois pour une fonctionnalité talent. Les talents jamais connectés sont exclus : ils ne peuvent pas avoir utilisé une page, donc les compter ferait passer un défaut d'arrivée pour un défaut de la fonctionnalité. C'est la population d'aujourd'hui : sur un mois de pointe ancien, des personnes depuis parties peuvent figurer au numérateur sans être au dénominateur, et la part peut alors dépasser légèrement 100 % ; c'est de la rotation d'équipe, pas une erreur de comptage.",
    ),
    fonctionnalites: metric(
      rank(
        rows,
        (row) => row.libelle,
        (row) => row.acteursDistinctsMoisDePointe,
      ),
      `Chaque fonctionnalité du catalogue, utilisée ou non. « utilisations » est le total sur la période. ${PEAK_RULE} « partDeLaPopulation » rapporte ce maximum à la population concernée. ${LAST_MONTH_RULE} La liste vient du catalogue et non des données : la demander aux données ne renverrait que les fonctionnalités déjà utilisées, alors que nommer celles qui ne le sont pas est tout l'objet. Classé sur le maximum mensuel d'acteurs et non sur les utilisations, une seule personne qui répète un export n'étant pas une adoption. ${MASKED_CELL_RULE} ${IMPERSONATION_RULE} ${FEATURE_AXIS_NOTE}`,
    ),
    evolution: metric(
      comparison
        ? {
            periode: comparison.periode,
            periodeReference: comparison.periodeReference,
          }
        : null,
      `Ce que « evolutionUtilisations » de chaque ligne compare : les mois calendaires révolus de la période demandée, listés dans « periode », face aux mêmes mois douze mois plus tôt, listés dans « periodeReference ». Douze mois et non la période précédente, parce que l'usage de Jump suit le calendrier scolaire : comparer septembre à août mesurerait la rentrée, pas l'adoption. Le mois en cours est écarté des deux côtés, n'étant pas comparable à un mois complet ; les utilisations affichées sur la ligne, elles, l'incluent, et ne sont donc pas la valeur comparée ici. L'évolution est toujours lue dans les totaux mensuels, seule source qui remonte à un an, quelle que soit la source des autres chiffres. « previous » vaut null tant que rien n'était mesuré sur la période de référence : un mois sans aucune ligne dans les totaux mensuels n'est pas un zéro, c'est une absence de mesure ; il vaut 0 quand la mesure existait et que personne ne s'en est servi. Vaut null en entier quand la période demandée ne contient aucun mois révolu. ${variationRule('count', COMPARISON_LABEL)}`,
    ),
    comparaison:
      filters.feature && comparison
        ? buildComparison(filters.feature, comparison, pop, rows)
        : null,
    dejaMesureAilleurs: metric(
      USAGE_MEASURED_ELSEWHERE,
      "Ce que ce catalogue ne mesure pas parce que la plateforme l'enregistre déjà ailleurs, et l'opération qui répond pour chacun. Un zéro ici ne voudrait pas dire que le fait n'arrive pas, seulement qu'il n'est pas compté deux fois.",
    ),
  };
}

/**
 * An event-scoped question outside the detailed window is refused.
 *
 * The cube carries a campus and never an event, so the two honest answers are a
 * refusal or a wider figure, and a wider figure answers a question nobody asked.
 * Zeros are not on the list: a confident zero indistinguishable from a finding is
 * what this whole tier exists to prevent.
 */
function assertEventReadable(window: UsageWindow, scope: Scope): void {
  if (window.store !== 'totaux mensuels' || !scope.event) return;
  throw new OperationRefusedError(
    `Cette question ne peut pas être isolée sur un événement au-delà de la conservation des lignes détaillées. ` +
      `Au-delà, seuls les totaux mensuels subsistent : ils portent sur une fonctionnalité, un campus et un mois, jamais sur un événement. ` +
      `Redemandez avec une fenêtre « days » plus courte, ou sans « eventId » pour obtenir le campus de cet événement.`,
  );
}

type Comparison = {
  periode: string[];
  periodeReference: string[];
  current: Map<string, FeatureTotals>;
  reference: Map<string, FeatureTotals>;
  /** Null when the reference period holds no measurement at all. */
  previousFor: (key: string) => number | null;
  previousActorsFor: (key: string) => number | null;
};

/**
 * The year-on-year halves, both read from the cube.
 *
 * Always the cube, even when the detailed rows could answer one half: a movement
 * computed one way here and another way there would be two growth figures under
 * one name, which is the defect this module was rewritten to remove.
 */
async function readComparison(
  features: readonly UsageFeatureKey[],
  window: UsageWindow,
  scope: Scope,
  now: Date,
): Promise<Comparison | null> {
  const months = comparisonMonths(window, now);
  if (!months) return null;
  const campusId = scope.campus?.id ?? null;
  const [cur, ref] = await Promise.all([
    readCubeTallies({ features, months: months.periode, campusId }),
    readCubeTallies({ features, months: months.periodeReference, campusId }),
  ]);
  const current = foldByFeature(cur.tallies);
  const reference = foldByFeature(ref.tallies);
  return {
    ...months,
    current,
    reference,
    previousFor: (key) =>
      ref.hasAnyRow ? (reference.get(key)?.uses ?? 0) : null,
    previousActorsFor: (key) =>
      ref.hasAnyRow ? (reference.get(key)?.peakActors ?? 0) : null,
  };
}

/** The full trio, returned only when one feature was named. */
function buildComparison(
  feature: UsageFeatureKey,
  comparison: Comparison,
  pop: { staff: number; talents: number },
  rows: FeatureRow[],
): FeatureComparison {
  const def = USAGE_FEATURE_DEFS[feature];
  const base = def.audience === 'staff' ? pop.staff : pop.talents;
  const row = rows.find((r) => r.feature === feature);
  const previousActors = comparison.previousActorsFor(feature);
  return {
    feature,
    periode: comparison.periode,
    periodeReference: comparison.periodeReference,
    utilisations: variation(
      comparison.current.get(feature)?.uses ?? 0,
      comparison.previousFor(feature),
      'count',
      COMPARISON_LABEL,
    ),
    acteursDistinctsMoisDePointe: variation(
      comparison.current.get(feature)?.peakActors ?? 0,
      previousActors,
      'count',
      COMPARISON_LABEL,
    ),
    partDeLaPopulation: variation(
      row?.partDeLaPopulation ?? null,
      previousActors === null ? null : share(previousActors, base),
      'points',
      COMPARISON_LABEL,
    ),
  };
}

export type AdoptionGaps = {
  filters: { schoolYear: string; campus: string; jours: number | null };
  source: Metric<UsageSource>;
  jamaisUtilisees: Metric<
    { feature: string; libelle: string; espace: string }[]
  >;
  devenuesInutilisees: Metric<
    {
      feature: string;
      libelle: string;
      espace: string;
      utilisationsPeriodeReference: number;
    }[]
  >;
  unSeulCampus: Metric<{ feature: string; libelle: string; campus: string }[]>;
  aRetirer: Metric<number | null>;
  aSurveiller: Metric<number | null>;
  aFormer: Metric<number | null>;
};

/**
 * The actionable half of the same data: what to retire, and where to train.
 *
 * Three lists rather than one figure, because the three decisions differ. A
 * feature no campus has touched is a candidate for removal, but a weak one:
 * most were never found. A feature that served a year ago and serves nobody now
 * was found and then abandoned, which is the strong signal. A feature exactly
 * one campus uses is the opposite of both: it works, and the other fourteen do
 * not know it exists.
 */
export async function getFeatureAdoptionGaps(
  scope: Scope = {},
  filters: { days?: number } = {},
  now: Date = new Date(),
): Promise<AdoptionGaps> {
  // Called for its year assertion, not for its events: see `getFeatureUsage`.
  await scopedEvents(scope);
  const days = windowDays(scope, filters.days, 90);
  const window = usageWindowFor(scope, days, now);
  const features = USAGE_FEATURE_KEYS;

  const [read, comparison] = await Promise.all([
    readTallies({
      features,
      window,
      campusId: scope.campus?.id ?? null,
    }),
    readComparison(features, window, scope, now),
  ]);

  const campusesByFeature = foldByFeatureCampus(read.tallies);
  const totals = foldByFeature(read.tallies);
  const campusNames = new Map(
    (await prisma.campus.findMany({ select: { id: true, name: true } })).map(
      (c) => [c.id, c.name],
    ),
  );

  // A missing cube is an absence of measurement, not an absence of use, and a
  // zero would pass the second off as the first. That distinction is what the
  // weekly digest branches on rather than naming every feature in Jump.
  const measured = read.hasAnyRow;

  const never = features
    .filter((key) => (totals.get(key)?.uses ?? 0) === 0)
    .map((key) => ({
      feature: key,
      libelle: USAGE_FEATURE_DEFS[key].label,
      espace: USAGE_FEATURE_DEFS[key].space,
    }));

  const abandoned = comparison
    ? features
        .filter((key) => {
          const before = comparison.previousFor(key);
          return (
            before !== null && before > 0 && (totals.get(key)?.uses ?? 0) === 0
          );
        })
        .map((key) => ({
          feature: key,
          libelle: USAGE_FEATURE_DEFS[key].label,
          espace: USAGE_FEATURE_DEFS[key].space,
          utilisationsPeriodeReference: comparison.previousFor(key) ?? 0,
        }))
    : [];

  const single = [...campusesByFeature.entries()]
    .filter(([, set]) => set.size === 1)
    .map(([key, set]) => ({
      feature: key,
      libelle: USAGE_FEATURE_DEFS[key as UsageFeatureKey].label,
      campus: campusNames.get([...set][0]) ?? 'inconnu',
    }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));

  const unmeasurable =
    "Vaut null quand les totaux mensuels n'ont pas été calculés sur la période : aucune ligne n'y est alors une absence d'usage, c'est une absence de mesure, et un zéro ferait passer la seconde pour la première.";

  return {
    filters: {
      schoolYear: scope.schoolYear ?? 'toutes',
      campus: scope.campus?.name ?? 'tous',
      jours: days ?? null,
    },
    source: usageSourceMetric(window, read.computedAt),
    jamaisUtilisees: metric(
      measured ? never : [],
      `Les fonctionnalités que personne n'a utilisées sur la période. Ce sont des candidates au retrait, pas une preuve : une fonctionnalité saisonnière peut être vide hors saison, et une fonctionnalité récente peut n'avoir jamais été trouvée, donc à lire avec la période et à côté de « devenuesInutilisees », qui est le signal fort. ${IMPERSONATION_RULE}`,
    ),
    devenuesInutilisees: metric(
      abandoned,
      "Les fonctionnalités qui ont servi sur la même période l'an dernier et qui n'ont servi à personne sur celle-ci, avec le nombre d'utilisations qu'elles avaient alors. C'est le signal de retrait le plus fort des trois : une fonctionnalité qui n'a jamais servi peut n'avoir jamais été trouvée, une fonctionnalité qui ne sert plus a été trouvée puis abandonnée. Vide tant que les totaux mensuels ne remontent pas à un an.",
    ),
    unSeulCampus: metric(
      single,
      "Les fonctionnalités qu'un seul campus utilise, avec lequel. C'est l'inverse d'un retrait : elles fonctionnent quelque part et les autres campus ignorent qu'elles existent, donc c'est une question de formation.",
    ),
    aRetirer: metric(
      measured ? never.length : null,
      `Combien de fonctionnalités personne n'a utilisées sur la période. ${unmeasurable}`,
    ),
    aSurveiller: metric(
      comparison ? abandoned.length : null,
      "Combien de fonctionnalités ont servi l'an dernier et ne servent plus. Vaut null quand la période demandée ne contient aucun mois révolu comparable.",
    ),
    aFormer: metric(
      measured ? single.length : null,
      `Combien de fonctionnalités un seul campus utilise, et sont donc à faire connaître ailleurs. ${unmeasurable}`,
    ),
  };
}

export type CampusCoverageRow = {
  campus: string;
  fonctionnalitesUtilisees: number;
  fonctionnalitesDisponibles: number;
  tauxAdoption: number | null;
  /** Only when one feature was named; null otherwise. See the definition. */
  acteursDistincts: number | null;
};

export type CampusFeatureCoverage = {
  filters: { schoolYear: string; jours: number | null; feature: string };
  source: Metric<UsageSource>;
  campus: Metric<Ranked<CampusCoverageRow>[]>;
  celluleMasquee: Metric<number | null>;
};

/**
 * The campus-by-feature matrix, folded to one row per campus and ranked.
 *
 * This is the answer to "quel campus a utilisé l'émargement / généré les
 * diplômes / affiché le QR", which was the question that started all of this.
 * Pass `feature` for one feature across every campus; omit it for each campus's
 * overall coverage of the catalogue.
 *
 * Only campus- and event-scoped features can appear: an admin-space feature is
 * national and carries no campus, so a per-campus reading of it would be an
 * artefact of who happened to be logged in.
 */
export async function getCampusFeatureCoverage(
  scope: Scope = {},
  filters: { days?: number; feature?: UsageFeatureKey } = {},
  now: Date = new Date(),
): Promise<CampusFeatureCoverage> {
  // Called for its year assertion, not for its events: see `getFeatureUsage`.
  await scopedEvents(scope);
  const days = windowDays(scope, filters.days, 90);
  const window = usageWindowFor(scope, days, now);
  const scoped = filters.feature
    ? [filters.feature]
    : USAGE_FEATURE_KEYS.filter(
        (key) => USAGE_FEATURE_DEFS[key].scope !== 'global',
      );

  const [campuses, read] = await Promise.all([
    prisma.campus.findMany({ select: { id: true, name: true } }),
    readTallies({ features: scoped, window }),
  ]);

  let masked = 0;
  const coverage: CampusCoverageRow[] = campuses.map((campus) => {
    const totals = foldForCampus(read.tallies, campus.id);
    const used = [...totals.values()].filter((t) => t.uses > 0).length;
    // Distinct people ACROSS features is not derivable: the cube counts per
    // feature, and one person using three features would be counted three
    // times. So the actor count exists only when a single feature was named.
    let actors: number | null = null;
    if (filters.feature) {
      const peak = totals.get(filters.feature)?.peakActors ?? 0;
      actors = maskCell(filters.feature, peak, true);
      if (actors === null) masked += 1;
    }
    return {
      campus: campus.name,
      fonctionnalitesUtilisees: used,
      fonctionnalitesDisponibles: scoped.length,
      tauxAdoption: share(used, scoped.length),
      acteursDistincts: actors,
    };
  });

  return {
    filters: {
      schoolYear: scope.schoolYear ?? 'toutes',
      jours: days ?? null,
      feature: filters.feature ?? 'toutes',
    },
    source: usageSourceMetric(window, read.computedAt),
    campus: metric(
      rank(
        coverage,
        (row) => row.campus,
        (row) => row.tauxAdoption,
      ),
      `Un campus par ligne : combien des fonctionnalités mesurables il a utilisées sur la période, sur combien de disponibles, et son taux d'adoption. Seules les fonctionnalités rattachées à un campus ou à un événement entrent ici : une fonctionnalité de l'espace admin est nationale et n'en porte aucun, donc la répartir par campus ne mesurerait que qui était connecté. « acteursDistincts » n'est donné que lorsqu'une fonctionnalité précise est demandée : additionner des acteurs sur plusieurs fonctionnalités compterait plusieurs fois la même personne. ${PEAK_RULE} ${MASKED_CELL_RULE} ${IMPERSONATION_RULE} ${CAMPUS_AXIS_NOTE}`,
    ),
    celluleMasquee: metric(
      filters.feature ? masked : null,
      `Combien de cellules sont masquées par le seuil de ${USAGE_SMALL_CELL_FLOOR} acteurs. Ce n'est pas une donnée manquante : c'est une donnée retenue, et un chiffre haut dit que la question posée est trop fine pour le nombre de personnes concernées. Vaut null quand aucune fonctionnalité précise n'est demandée, puisqu'il n'y a alors aucune cellule d'acteurs à masquer.`,
    ),
  };
}
