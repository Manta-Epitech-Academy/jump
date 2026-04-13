export const DIFFICULTY_XP: Record<string, number> = {
  Débutant: 20,
  Intermédiaire: 45,
  Avancé: 75,
};

/**
 * Calculates how much XP an activity is worth based on its difficulty.
 */
export function getActivityXpValue(difficulte: string): number {
  return DIFFICULTY_XP[difficulte] || 20;
}

/**
 * @deprecated Use getActivityXpValue — kept for Subject pages that still display Subject XP.
 * TODO: Remove once subject→activity rename is done in: admin/subjects, (app)/subjects, SubjectPicker, recommender
 */
export const getSubjectXpValue = getActivityXpValue;

/**
 * Extracts XP-eligible activities from a participation's activity list.
 * Filters out organisational activities (roll call) which don't contribute XP.
 */
export function getXpEligibleActivities<
  T extends { activity: { activityType: string; difficulte: string | null } },
>(participationActivities: T[]): { difficulte: string | null }[] {
  return participationActivities
    .filter((pa) => pa.activity.activityType !== 'orga')
    .map((pa) => ({ difficulte: pa.activity.difficulte }));
}

/**
 * Calculates total XP for a list of activities (or any items with a `difficulte` field).
 * Returns 20 (base attendance XP) when the list is empty — this covers students
 * who are marked present but have no non-orga activities assigned.
 */
export function getTotalXp(items: { difficulte: string | null }[]): number {
  if (!items || items.length === 0) return 20;
  return items.reduce(
    (total, item) => total + getActivityXpValue(item.difficulte ?? ''),
    0,
  );
}
