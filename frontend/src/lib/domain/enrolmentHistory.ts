/**
 * A talent's parcours at Epitech, as an event's roster reads it: how many times
 * they had already enrolled on the campus before this event.
 *
 * Counted on enrolments, not on attendance. "Came" is only provable by
 * émargement, which most past events never had, so a parcours built on
 * presence would call a talent who came three times without being checked in a
 * newcomer. An enrolment the dev space masks does not count, like everywhere
 * else in that space.
 */

/** The filter's buckets, newcomer first. The last one gathers the long tail. */
export const PARCOURS_BUCKETS = ['nouveau', '1', '2', '3-et-plus'] as const;

export type ParcoursBucket = (typeof PARCOURS_BUCKETS)[number];

export function parcoursBucket(priorEnrolments: number): ParcoursBucket {
  if (priorEnrolments <= 0) return 'nouveau';
  if (priorEnrolments === 1) return '1';
  if (priorEnrolments === 2) return '2';
  return '3-et-plus';
}

/**
 * Neutral labels for the filter, where one line stands for talents of every
 * gender. The cell beside each talent agrees with them instead
 * (`parcoursLabel`).
 */
export const PARCOURS_BUCKET_LABELS: Record<ParcoursBucket, string> = {
  nouveau: 'Première inscription',
  '1': '1 inscription passée',
  '2': '2 inscriptions passées',
  '3-et-plus': '3 inscriptions passées ou plus',
};

/**
 * The cell's wording, agreed with the talent's civilité: "Nouvelle",
 * "Déjà inscrit 2 fois". `autre` and an unknown civilité take the inclusive
 * form rather than defaulting to the masculine.
 */
export function parcoursLabel(
  priorEnrolments: number,
  civilite: string | null | undefined,
): string {
  const [nouveau, inscrit] =
    civilite === 'femme'
      ? ['Nouvelle', 'inscrite']
      : civilite === 'homme'
        ? ['Nouveau', 'inscrit']
        : ['Nouveau·elle', 'inscrit·e'];
  if (priorEnrolments <= 0) return nouveau;
  return `Déjà ${inscrit} ${priorEnrolments} fois`;
}
