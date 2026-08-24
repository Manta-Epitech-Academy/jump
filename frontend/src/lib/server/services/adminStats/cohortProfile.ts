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
import { cohortWhere, onboardingCompleteWhere, scopeLabels } from './cohort';
import { onboardingEligibleWhere } from '$lib/server/db/onboardingEligibility';

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
  "Part des talents ayant terminé l'intégralité de leur parcours d'inscription en ligne, Charte Informatique et Éthique comprise, en pourcentage des talents concernés par ce parcours. Le dénominateur exclut les collégiens, qui n'ont pas de dossier d'inscription sur Jump et ne pourraient donc jamais le terminer.";

export type BreakdownRow = {
  /** Stored value, or null for the "not filled in" bucket. */
  value: string | null;
  label: string;
  count: number;
  /** Share of the cohort this row represents. */
  share: number | null;
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
  onboardingNotApplicable: Metric;
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
  cohort: number,
): BreakdownRow[] {
  const counts = new Map(grouped.map((g) => [g.value, g.count]));
  const row = (value: string | null, label: string): BreakdownRow => {
    const count = counts.get(value) ?? 0;
    return { value, label, count, share: share(count, cohort) };
  };

  const rows: BreakdownRow[] = known.map((k) => row(k.value, k.label));

  for (const [value] of counts) {
    if (value === null) continue;
    if (known.some((k) => k.value === value)) continue;
    rows.push(row(value, value));
  }

  rows.push(row(null, UNKNOWN_LABEL));
  return rows;
}

export async function getCohortProfile(
  scope: Scope = {},
): Promise<CohortProfile> {
  const where = await cohortWhere(scope);

  const [cohort, byCivilite, byNiveauRaw, completed, connected, eligible] =
    await Promise.all([
      prisma.talent.count({ where }),
      prisma.talent.groupBy({
        by: ['civilite'],
        where,
        _count: { _all: true },
      }),
      prisma.talent.groupBy({ by: ['niveau'], where, _count: { _all: true } }),
      prisma.talent.count({
        where: { AND: [where, onboardingCompleteWhere(scope)] },
      }),
      prisma.talent.count({
        where: { AND: [where, { firstLoginAt: { not: null } }] },
      }),
      prisma.talent.count({
        where: { AND: [where, onboardingEligibleWhere] },
      }),
    ]);

  const gender = breakdownRows(
    byCivilite.map((g) => ({ value: g.civilite, count: g._count._all })),
    CIVILITE_OPTIONS,
    cohort,
  );
  const niveaux = breakdownRows(
    byNiveauRaw.map((g) => ({ value: g.niveau, count: g._count._all })),
    NIVEAUX.map((n) => ({ value: n, label: niveauLabel(n) })),
    cohort,
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
      `Répartition des talents du périmètre par civilité déclarée, « share » étant la part de la cohorte, en pourcentage. La civilité vient de Salesforce ou de ce que le talent a saisi lui-même à l'inscription ; « ${UNKNOWN_LABEL} » regroupe ceux pour qui elle est absente, et sa part dit ce que la répartition ne couvre pas.`,
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
      `Répartition des talents du périmètre par niveau scolaire de l'année en cours, « share » étant la part de la cohorte, en pourcentage. Le niveau est renseigné par Salesforce ; « ${UNKNOWN_LABEL} » regroupe ceux pour qui il est absent.`,
    ),
    onboardingCompleted: metric(
      completed,
      "Talents du périmètre ayant terminé l'intégralité du parcours d'inscription en ligne, Charte Informatique et Éthique acceptée comprise.",
    ),
    onboardingCompletedShare: metric(
      share(completed, eligible),
      `${ONBOARDING_COMPLETED_SHARE_RULE} Vaut null si aucun talent du périmètre n'est concerné par le parcours.`,
    ),
    onboardingNotApplicable: metric(
      cohort - eligible,
      "Talents du périmètre sans dossier d'inscription : les collégiens, qui accèdent à Jump sans parcours d'inscription. Ils sont comptés dans la cohorte mais exclus du dénominateur du taux ci-dessus ; leur part de la cohorte se lit sur la ligne « collégien » de la répartition par niveau.",
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
