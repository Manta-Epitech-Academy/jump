/**
 * Which features of Jump are actually used, and by whom.
 *
 * The gap this closes is the one the whole `Usage_*` model was built for: Jump
 * could say who was enrolled, who had signed and who was present, and nothing
 * about which of its own screens anybody opened. So a feature nobody used looked
 * exactly like a feature nobody had asked about, and both looked like a feature
 * in daily use.
 *
 * Three reading rules this file exists to hold in one place.
 *
 * THE WINDOW DECIDES THE SOURCE. Anything inside the raw retention window is
 * counted from `Usage_FeatureUse`, because only that table still knows who did
 * it and therefore how many distinct people did. Anything older is read from
 * `Usage_FeatureMonthly`, which is actor-free by design. A caller never picks:
 * they name a number of days, and `usageSource` says which side answered, so a
 * figure can never be quoted as exact when it came from the cube.
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
  USAGE_RAW_RETENTION_DAYS,
  type UsageAudience,
  type UsageFeatureKey,
  type UsageSpace,
} from '$lib/domain/usage';
import { schoolYearBounds } from '$lib/domain/schoolYear';
import {
  metric,
  rank,
  rankAxisNote,
  RANK_UNITS,
  share,
  type Metric,
  type Ranked,
} from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { scopedEvents, scopeLabels } from './cohort';

const FEATURE_AXIS_NOTE = rankAxisNote(RANK_UNITS.feature);
const CAMPUS_AXIS_NOTE = rankAxisNote(RANK_UNITS.campus);

/**
 * The disclosure floor on a per-campus talent cell.
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
 */
export const USAGE_SMALL_CELL_FLOOR = 5;

const MASKED_CELL_RULE =
  `Pour les fonctionnalités côté talent, le nombre d'acteurs distincts d'un campus est masqué (null) en dessous de ${USAGE_SMALL_CELL_FLOOR}, ` +
  `car dans un petit campus un compte de 1 ou 2 désignerait presque des personnes. Un zéro n'est jamais masqué : il ne désigne personne et c'est la réponse la plus utile.`;

const IMPERSONATION_RULE =
  "Les consultations faites par un administrateur en exploration d'un campus sont exclues : un administrateur qui regarde n'est pas un campus qui adopte.";

const RAW_WINDOW_RULE =
  `Compté sur les ${USAGE_RAW_RETENTION_DAYS} derniers jours au plus, la durée de conservation des lignes détaillées. ` +
  `Au-delà, seuls les totaux mensuels subsistent : ils donnent les utilisations et les acteurs distincts par mois, jamais un cumul d'acteurs sur plusieurs mois, qui compterait dix fois quelqu'un actif dix mois.`;

const MONTHLY_ACTOR_RULE =
  "Un acteur distinct est compté par mois : quelqu'un d'actif en août et en septembre compte une fois dans chaque mois, jamais une fois sur les deux. C'est la mesure standard, et pour les talents c'est la seule possible, leur pseudonyme changeant chaque mois.";

/** Which store answered, so an answer can never look more exact than it is. */
export type UsageSource = 'lignes détaillées' | 'totaux mensuels';

export type FeatureRow = {
  feature: UsageFeatureKey;
  libelle: string;
  definition: string;
  audience: UsageAudience;
  espace: UsageSpace;
  utilisations: number;
  acteursDistincts: number | null;
  /** Share of the population that could have used it; null when unmeasurable. */
  partDeLaPopulation: number | null;
  derniereUtilisation: string | null;
};

export type FeatureUsage = {
  filters: {
    schoolYear: string;
    campus: string;
    event: string;
    audience: string;
    espace: string;
    jours: number;
  };
  source: Metric<UsageSource>;
  populationConcernee: Metric<{ staff: number; talents: number }>;
  fonctionnalites: Metric<Ranked<FeatureRow>[]>;
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

/** The `occurredAt` window: the tighter of the day count and the school year. */
function windowFor(
  scope: Scope,
  days: number,
): { from: Date; to: Date | null; withinRaw: boolean } {
  const now = new Date();
  const byDays = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  if (!scope.schoolYear) {
    return {
      from: byDays,
      to: null,
      withinRaw: days <= USAGE_RAW_RETENTION_DAYS,
    };
  }
  const year = schoolYearBounds(scope.schoolYear);
  const from = year.from > byDays ? year.from : byDays;
  const to = year.to < now ? year.to : null;
  return {
    from,
    to,
    withinRaw:
      days <= USAGE_RAW_RETENTION_DAYS &&
      from.getTime() >=
        now.getTime() - USAGE_RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  };
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

function maskCell(
  key: UsageFeatureKey,
  actors: number,
  perCampus: boolean,
): number | null {
  if (!perCampus) return actors;
  if (USAGE_FEATURE_DEFS[key].audience !== 'talent') return actors;
  if (actors === 0) return 0;
  return actors < USAGE_SMALL_CELL_FLOOR ? null : actors;
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
): Promise<FeatureUsage> {
  // Called for its year assertion, not for its events: this is where an unknown
  // school year becomes a refusal instead of an empty window, which is the
  // tier's rule that an unknown scope is never a zero. `resolveScope` already
  // covers the campus and the event id; the year is asserted here, by the same
  // shared helper every other aggregate uses, so the three cannot disagree about
  // which years exist.
  await scopedEvents(scope);
  const days = filters.days ?? 30;
  const features = selectedFeatures(filters);
  const { from, to, withinRaw } = windowFor(scope, days);
  const [pop, grouped, lastUses] = await Promise.all([
    population(scope),
    prisma.usage_FeatureUse.groupBy({
      by: ['feature'],
      where: {
        feature: { in: features },
        impersonated: false,
        occurredAt: { gte: from, ...(to ? { lt: to } : {}) },
        ...(scope.campus ? { campusId: scope.campus.id } : {}),
        ...(scope.event ? { eventId: scope.event.id } : {}),
      },
      _count: { _all: true },
      _max: { occurredAt: true },
    }),
    // Distinct actors cannot come out of `groupBy`, so it is one narrow query
    // selecting only the two pseudonymous columns.
    prisma.usage_FeatureUse.findMany({
      where: {
        feature: { in: features },
        impersonated: false,
        occurredAt: { gte: from, ...(to ? { lt: to } : {}) },
        ...(scope.campus ? { campusId: scope.campus.id } : {}),
        ...(scope.event ? { eventId: scope.event.id } : {}),
      },
      select: { feature: true, staffProfileId: true, actorHash: true },
    }),
  ]);

  const actorsByFeature = new Map<string, Set<string>>();
  for (const row of lastUses) {
    const ref = row.staffProfileId ?? row.actorHash;
    if (!ref) continue;
    const set = actorsByFeature.get(row.feature) ?? new Set<string>();
    set.add(ref);
    actorsByFeature.set(row.feature, set);
  }
  const countByFeature = new Map(
    grouped.map((g) => [
      g.feature,
      { uses: g._count._all, last: g._max.occurredAt },
    ]),
  );

  const rows: FeatureRow[] = features.map((key) => {
    const def = USAGE_FEATURE_DEFS[key];
    const tally = countByFeature.get(key);
    const actors = actorsByFeature.get(key)?.size ?? 0;
    const base = def.audience === 'staff' ? pop.staff : pop.talents;
    return {
      feature: key,
      libelle: def.label,
      definition: def.definition,
      audience: def.audience,
      espace: def.space,
      utilisations: tally?.uses ?? 0,
      acteursDistincts: actors,
      partDeLaPopulation: share(actors, base),
      derniereUtilisation: tally?.last?.toISOString() ?? null,
    };
  });

  return {
    filters: {
      ...scopeLabels(scope),
      audience: filters.audience ?? 'toutes',
      espace: filters.space ?? 'tous',
      jours: days,
    },
    source: metric<UsageSource>(
      withinRaw ? 'lignes détaillées' : 'totaux mensuels',
      `D'où viennent ces chiffres. ${RAW_WINDOW_RULE}`,
    ),
    populationConcernee: metric(
      pop,
      "Le dénominateur de chaque part : les membres de l'équipe ayant un rôle pour une fonctionnalité staff, et les talents s'étant déjà connectés au moins une fois pour une fonctionnalité talent. Les talents jamais connectés sont exclus : ils ne peuvent pas avoir utilisé une page, donc les compter ferait passer un défaut d'arrivée pour un défaut de la fonctionnalité.",
    ),
    fonctionnalites: metric(
      rank(
        rows,
        (row) => row.libelle,
        (row) => row.acteursDistincts,
      ),
      `Chaque fonctionnalité du catalogue, utilisée ou non, avec ses utilisations, ses acteurs distincts, la part de la population concernée et sa dernière utilisation. La liste vient du catalogue et non des données : la demander aux données ne renverrait que les fonctionnalités déjà utilisées, alors que nommer celles qui ne le sont pas est tout l'objet. Classé sur les acteurs distincts et non sur les utilisations, une seule personne qui répète un export n'étant pas une adoption. ${MONTHLY_ACTOR_RULE} ${IMPERSONATION_RULE} ${FEATURE_AXIS_NOTE}`,
    ),
    dejaMesureAilleurs: metric(
      USAGE_MEASURED_ELSEWHERE,
      "Ce que ce catalogue ne mesure pas parce que la plateforme l'enregistre déjà ailleurs, et l'opération qui répond pour chacun. Un zéro ici ne voudrait pas dire que le fait n'arrive pas, seulement qu'il n'est pas compté deux fois.",
    ),
  };
}

export type AdoptionGaps = {
  filters: { schoolYear: string; campus: string; jours: number };
  jamaisUtilisees: Metric<
    { feature: string; libelle: string; espace: string }[]
  >;
  unSeulCampus: Metric<{ feature: string; libelle: string; campus: string }[]>;
  aRetirer: Metric<number>;
  aFormer: Metric<number>;
};

/**
 * The actionable half of the same data: what to retire, and where to train.
 *
 * Two lists rather than one figure, because the two decisions are different. A
 * feature no campus has touched is a candidate for removal. A feature exactly
 * one campus uses is the opposite: it works, and the other fourteen do not know
 * it exists.
 */
export async function getFeatureAdoptionGaps(
  scope: Scope = {},
  filters: { days?: number } = {},
): Promise<AdoptionGaps> {
  // Called for its year assertion, not for its events: this is where an unknown
  // school year becomes a refusal instead of an empty window, which is the
  // tier's rule that an unknown scope is never a zero. `resolveScope` already
  // covers the campus and the event id; the year is asserted here, by the same
  // shared helper every other aggregate uses, so the three cannot disagree about
  // which years exist.
  await scopedEvents(scope);
  const days = filters.days ?? 90;
  const { from, to } = windowFor(scope, days);
  const used = await prisma.usage_FeatureUse.groupBy({
    by: ['feature', 'campusId'],
    where: {
      impersonated: false,
      occurredAt: { gte: from, ...(to ? { lt: to } : {}) },
      ...(scope.campus ? { campusId: scope.campus.id } : {}),
    },
    _count: { _all: true },
  });

  const campusesByFeature = new Map<string, Set<string>>();
  for (const row of used) {
    const set = campusesByFeature.get(row.feature) ?? new Set<string>();
    if (row.campusId) set.add(row.campusId);
    campusesByFeature.set(row.feature, set);
  }
  const campusNames = new Map(
    (await prisma.campus.findMany({ select: { id: true, name: true } })).map(
      (c) => [c.id, c.name],
    ),
  );

  const never = USAGE_FEATURE_KEYS.filter(
    (key) => !campusesByFeature.has(key),
  ).map((key) => ({
    feature: key,
    libelle: USAGE_FEATURE_DEFS[key].label,
    espace: USAGE_FEATURE_DEFS[key].space,
  }));

  const single = [...campusesByFeature.entries()]
    .filter(([, set]) => set.size === 1)
    .map(([key, set]) => ({
      feature: key,
      libelle: USAGE_FEATURE_DEFS[key as UsageFeatureKey].label,
      campus: campusNames.get([...set][0]) ?? 'inconnu',
    }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));

  return {
    filters: {
      schoolYear: scope.schoolYear ?? 'toutes',
      campus: scope.campus?.name ?? 'tous',
      jours: days,
    },
    jamaisUtilisees: metric(
      never,
      `Les fonctionnalités que personne n'a utilisées sur la période. Ce sont les candidates au retrait, pas une preuve : une fonctionnalité saisonnière peut être vide hors saison, donc à lire avec la période. ${IMPERSONATION_RULE}`,
    ),
    unSeulCampus: metric(
      single,
      "Les fonctionnalités qu'un seul campus utilise, avec lequel. C'est l'inverse d'un retrait : elles fonctionnent quelque part et les autres campus ignorent qu'elles existent, donc c'est une question de formation.",
    ),
    aRetirer: metric(
      never.length,
      "Combien de fonctionnalités personne n'a utilisées sur la période.",
    ),
    aFormer: metric(
      single.length,
      'Combien de fonctionnalités un seul campus utilise, et sont donc à faire connaître ailleurs.',
    ),
  };
}

export type CampusCoverageRow = {
  campus: string;
  fonctionnalitesUtilisees: number;
  fonctionnalitesDisponibles: number;
  tauxAdoption: number | null;
  acteursDistincts: number | null;
};

export type CampusFeatureCoverage = {
  filters: { schoolYear: string; jours: number; feature: string };
  campus: Metric<Ranked<CampusCoverageRow>[]>;
  celluleMasquee: Metric<number>;
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
): Promise<CampusFeatureCoverage> {
  // Called for its year assertion, not for its events: this is where an unknown
  // school year becomes a refusal instead of an empty window, which is the
  // tier's rule that an unknown scope is never a zero. `resolveScope` already
  // covers the campus and the event id; the year is asserted here, by the same
  // shared helper every other aggregate uses, so the three cannot disagree about
  // which years exist.
  await scopedEvents(scope);
  const days = filters.days ?? 90;
  const { from, to } = windowFor(scope, days);
  const scoped = filters.feature
    ? [filters.feature]
    : USAGE_FEATURE_KEYS.filter(
        (key) => USAGE_FEATURE_DEFS[key].scope !== 'global',
      );

  const [campuses, rows] = await Promise.all([
    prisma.campus.findMany({ select: { id: true, name: true } }),
    prisma.usage_FeatureUse.findMany({
      where: {
        feature: { in: scoped },
        impersonated: false,
        campusId: { not: null },
        occurredAt: { gte: from, ...(to ? { lt: to } : {}) },
      },
      select: {
        feature: true,
        campusId: true,
        staffProfileId: true,
        actorHash: true,
      },
    }),
  ]);

  const perCampus = new Map<
    string,
    { features: Set<string>; actors: Set<string> }
  >();
  for (const row of rows) {
    if (!row.campusId) continue;
    const bucket = perCampus.get(row.campusId) ?? {
      features: new Set<string>(),
      actors: new Set<string>(),
    };
    bucket.features.add(row.feature);
    const ref = row.staffProfileId ?? row.actorHash;
    if (ref) bucket.actors.add(ref);
    perCampus.set(row.campusId, bucket);
  }

  let masked = 0;
  const coverage: CampusCoverageRow[] = campuses.map((campus) => {
    const bucket = perCampus.get(campus.id);
    const used = bucket?.features.size ?? 0;
    const actors = bucket?.actors.size ?? 0;
    // A single-feature matrix is per-campus per-feature, which is the shape the
    // floor exists for; the overall coverage view aggregates across features and
    // is not.
    const shown = filters.feature
      ? maskCell(filters.feature, actors, true)
      : actors;
    if (shown === null) masked += 1;
    return {
      campus: campus.name,
      fonctionnalitesUtilisees: used,
      fonctionnalitesDisponibles: scoped.length,
      tauxAdoption: share(used, scoped.length),
      acteursDistincts: shown,
    };
  });

  return {
    filters: {
      schoolYear: scope.schoolYear ?? 'toutes',
      jours: days,
      feature: filters.feature ?? 'toutes',
    },
    campus: metric(
      rank(
        coverage,
        (row) => row.campus,
        (row) => row.tauxAdoption,
      ),
      `Un campus par ligne : combien des fonctionnalités mesurables il a utilisées sur la période, sur combien de disponibles, et son taux d'adoption. Seules les fonctionnalités rattachées à un campus ou à un événement entrent ici : une fonctionnalité de l'espace admin est nationale et n'en porte aucun, donc la répartir par campus ne mesurerait que qui était connecté. ${MASKED_CELL_RULE} ${IMPERSONATION_RULE} ${CAMPUS_AXIS_NOTE}`,
    ),
    celluleMasquee: metric(
      masked,
      `Combien de cellules sont masquées par le seuil de ${USAGE_SMALL_CELL_FLOOR} acteurs. Ce n'est pas une donnée manquante : c'est une donnée retenue, et un chiffre haut dit que la question posée est trop fine pour le nombre de personnes concernées.`,
    ),
  };
}
