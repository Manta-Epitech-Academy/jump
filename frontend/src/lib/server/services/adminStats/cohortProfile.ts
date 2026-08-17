/**
 * Who the cohort is: how many, their declared civilité, their niveau, how far
 * they got through sign-up, and how many ever logged in.
 *
 * Counted in SQL over the shared cohort definition (`cohort.ts`), so this answer
 * and the funnel are talking about the same people. No name, email or phone is
 * selected here; the smallest unit this file can see is a group.
 *
 * Every proportion somebody would otherwise work out by hand is returned as its
 * own figure with its own definition, including the denominator it used. The
 * whole tier exists so that a share is read, not derived.
 */

import { prisma } from '$lib/server/db';
import { CIVILITE_OPTIONS } from '$lib/domain/profile';
import { NIVEAUX, niveauLabel, compareNiveaux } from '$lib/domain/niveau';
import { VISIBLE_PARTICIPATION_DEFINITION } from '$lib/domain/sfMemberStatus';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { cohortWhere, ONBOARDING_COMPLETE_WHERE, scopeLabels } from './cohort';

/** How an absent value is named in every breakdown here. */
const UNKNOWN_LABEL = 'Non renseigné';

/**
 * The counting rules of the two figures the campus comparison re-ranks, stated
 * here because this is the file that owns them, and imported there rather than
 * retyped. Each site appends its own null clause: "vaut null sur le périmètre" and
 * "vaut null sur ce campus" are the same rule read at two altitudes, and only the
 * rule has to be single-sourced.
 */
export const WOMEN_SHARE_RULE = `Part de femmes parmi les talents dont la civilité est renseignée, en pourcentage : le dénominateur exclut les talents sans civilité (« ${UNKNOWN_LABEL} »), pour ne pas sous-estimer la proportion.`;

export const ONBOARDING_COMPLETED_SHARE_RULE =
  "Part des talents ayant terminé l'intégralité de leur parcours d'inscription en ligne, charte de données comprise, en pourcentage de la cohorte.";

export type BreakdownRow = {
  /** Stored value, or null for the "not filled in" bucket. */
  value: string | null;
  label: string;
  count: number;
};

export type CohortProfile = {
  filters: { schoolYear: string; campus: string; event: string };
  cohort: Metric;
  byGender: Metric<BreakdownRow[]>;
  womenShare: Metric<number | null>;
  genderKnownShare: Metric<number | null>;
  byNiveau: Metric<BreakdownRow[]>;
  onboardingCompleted: Metric;
  onboardingCompletedShare: Metric<number | null>;
  connected: Metric;
  connectedShare: Metric<number | null>;
};

/**
 * Turns a `groupBy` into a stable, fully-populated breakdown: every value the
 * catalogue knows about appears even at zero (an absent line reads as "not
 * asked", a zero reads as "asked, nobody"), unexpected stored values are kept
 * rather than dropped, and everything null lands in one named bucket.
 */
function breakdownRows(
  grouped: { value: string | null; count: number }[],
  known: readonly { value: string; label: string }[],
): BreakdownRow[] {
  const counts = new Map(grouped.map((g) => [g.value, g.count]));
  const rows: BreakdownRow[] = known.map((k) => ({
    value: k.value,
    label: k.label,
    count: counts.get(k.value) ?? 0,
  }));

  for (const [value, count] of counts) {
    if (value === null) continue;
    if (known.some((k) => k.value === value)) continue;
    rows.push({ value, label: value, count });
  }

  rows.push({
    value: null,
    label: UNKNOWN_LABEL,
    count: counts.get(null) ?? 0,
  });
  return rows;
}

export async function getCohortProfile(
  scope: Scope = {},
): Promise<CohortProfile> {
  const where = await cohortWhere(scope);

  const [cohort, byCivilite, byNiveauRaw, completed, connected] =
    await Promise.all([
      prisma.talent.count({ where }),
      prisma.talent.groupBy({
        by: ['civilite'],
        where,
        _count: { _all: true },
      }),
      prisma.talent.groupBy({ by: ['niveau'], where, _count: { _all: true } }),
      prisma.talent.count({
        where: { AND: [where, ONBOARDING_COMPLETE_WHERE] },
      }),
      prisma.talent.count({
        where: { AND: [where, { firstLoginAt: { not: null } }] },
      }),
    ]);

  const gender = breakdownRows(
    byCivilite.map((g) => ({ value: g.civilite, count: g._count._all })),
    CIVILITE_OPTIONS,
  );
  const niveaux = breakdownRows(
    byNiveauRaw.map((g) => ({ value: g.niveau, count: g._count._all })),
    NIVEAUX.map((n) => ({ value: n, label: niveauLabel(n) })),
  ).sort((a, b) => {
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return compareNiveaux(a.value, b.value);
  });

  const women = gender.find((r) => r.value === 'femme')?.count ?? 0;
  const genderKnown = gender
    .filter((r) => r.value !== null)
    .reduce((sum, r) => sum + r.count, 0);

  return {
    filters: scopeLabels(scope),
    cohort: metric(
      cohort,
      `Talents inscrits à au moins un événement du périmètre, ${VISIBLE_PARTICIPATION_DEFINITION}. Chaque talent compte une fois, même s'il est inscrit à plusieurs événements du périmètre.`,
    ),
    byGender: metric(
      gender,
      `Répartition des talents du périmètre par civilité déclarée. La civilité vient de Salesforce ou de ce que le talent a saisi lui-même à l'inscription ; « ${UNKNOWN_LABEL} » regroupe ceux pour qui elle est absente.`,
    ),
    womenShare: metric(
      share(women, genderKnown),
      `${WOMEN_SHARE_RULE} Vaut null si aucune civilité n'est renseignée sur le périmètre.`,
    ),
    genderKnownShare: metric(
      share(genderKnown, cohort),
      "Part des talents du périmètre dont la civilité est renseignée, en pourcentage. C'est la couverture de la donnée : plus elle est basse, moins la répartition par civilité est représentative.",
    ),
    byNiveau: metric(
      niveaux,
      `Répartition des talents du périmètre par niveau scolaire de l'année en cours. Le niveau est renseigné par Salesforce ; « ${UNKNOWN_LABEL} » regroupe ceux pour qui il est absent.`,
    ),
    onboardingCompleted: metric(
      completed,
      "Talents du périmètre ayant terminé l'intégralité du parcours d'inscription en ligne, charte de données acceptée comprise.",
    ),
    onboardingCompletedShare: metric(
      share(completed, cohort),
      `${ONBOARDING_COMPLETED_SHARE_RULE} Vaut null si la cohorte du périmètre est vide.`,
    ),
    connected: metric(
      connected,
      "Talents du périmètre s'étant connectés à Jump au moins une fois. Compté sur la date de première connexion enregistrée sur le talent, qui n'est jamais effacée : une déconnexion ou une réinitialisation de compte ne la remet pas à zéro.",
    ),
    connectedShare: metric(
      share(connected, cohort),
      "Part des talents du périmètre s'étant connectés au moins une fois, en pourcentage de la cohorte. Vaut null si la cohorte est vide.",
    ),
  };
}
