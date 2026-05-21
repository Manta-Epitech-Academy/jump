export const difficultes = ['Débutant', 'Intermédiaire', 'Avancé'] as const;

/**
 * One-off XP granted when a talent finishes onboarding (the "+50 XP" arrival
 * celebration). Granted in `(talent)/onboarding/+page.server.ts` and refunded
 * by the admin onboarding-reset in `services/talentAccount.ts`.
 */
export const WELCOME_XP_BONUS = 50;

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
 * Extracts XP-eligible activities from a participation's activity list.
 * Filters out organisational activities (roll call) and activities the student
 * was not present for (parallel tracks they didn't attend).
 */
export function getXpEligibleActivities<
  T extends {
    isPresent: boolean;
    activity: { activityType: string; difficulte: string | null };
  },
>(participationActivities: T[]): { difficulte: string | null }[] {
  return participationActivities
    .filter((pa) => pa.isPresent && pa.activity.activityType !== 'orga')
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
