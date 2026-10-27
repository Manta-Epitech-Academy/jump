/**
 * A talent's parcours at Epitech, as an event's roster reads it: how many times
 * they had already enrolled on the campus before this event.
 *
 * Counted on enrolments, not on attendance. "Came" is only provable by
 * émargement, which most past events never had, so a parcours built on
 * presence would call a talent who came three times without being checked in a
 * newcomer. An enrolment the dev space masks does not count, like everywhere
 * else in that space.
 *
 * Worded as the rank of this enrolment (« 3ᵉ inscription »): one short line in
 * a roster cell, and the same words whoever the talent is, where « Déjà
 * inscrit·e 2 fois » took two lines and an agreement with the civilité.
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

export const PARCOURS_BUCKET_LABELS: Record<ParcoursBucket, string> = {
  nouveau: '1ʳᵉ inscription',
  '1': '2ᵉ inscription',
  '2': '3ᵉ inscription',
  '3-et-plus': '4ᵉ inscription ou plus',
};

/** This enrolment's rank on the campus: « 1ʳᵉ inscription », « 5ᵉ inscription ». */
export function parcoursLabel(priorEnrolments: number): string {
  const rank = Math.max(0, priorEnrolments) + 1;
  return rank === 1 ? '1ʳᵉ inscription' : `${rank}ᵉ inscription`;
}
