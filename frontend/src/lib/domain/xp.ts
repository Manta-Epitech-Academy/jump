export const difficultes = ['Débutant', 'Intermédiaire', 'Avancé'] as const;

/**
 * One-off XP granted when a talent finishes onboarding (the arrival
 * celebration shown on the dashboard). Granted in
 * `(talent)/onboarding/+page.server.ts` and refunded by the admin
 * onboarding-reset in `services/talentAccount.ts`. The base; earliest finishers
 * earn an additional `onboardingEarlyBirdBonus` on top (see below).
 */
export const WELCOME_XP_BONUS = 200;

/**
 * XP granted for finishing the daily minigame. Flat — it rewards showing up and
 * completing the challenge, not performance (placing on the board is the
 * performance reward, see `minigameRankBonus`). Kept below the top activity tier
 * (Avancé = 75) so a repeatable daily game never out-earns the most demanding
 * real activity.
 */
export const MINIGAME_XP_REWARD = 50;

/**
 * How many earliest onboarding completers, PER CAMPUS, earn an early-bird bonus.
 * Per-campus (not a global N) so a small campus (~26 students, La Reunion) isn't
 * shut out by a large one (200+) whose students simply finish first in absolute
 * terms. The position is the talent's 0-based rank among completers in their own
 * campus at sign-time; cohort size is never needed.
 */
export const ONBOARDING_EARLY_BIRD_LIMIT = 10;

/**
 * Additive bonus (on top of {@link WELCOME_XP_BONUS}) for a 0-based onboarding
 * completion position within the campus. Decaying tiers, as multiples of the
 * base so the UI can read it as "x2" / "x1.5":
 *   position 0     → +200 (x2, the very first finisher)
 *   position 1..2  → +100 (x1.5)
 *   position 3..9  → +50
 *   position ≥ 10  → 0 (caller skips the grant)
 * Decay rewards genuine pioneers most without making the 10th slot worthless.
 */
export function onboardingEarlyBirdBonus(position: number): number {
  if (position < 0 || position >= ONBOARDING_EARLY_BIRD_LIMIT) return 0;
  if (position === 0) return WELCOME_XP_BONUS;
  if (position <= 2) return Math.round(WELCOME_XP_BONUS / 2);
  return Math.round(WELCOME_XP_BONUS / 4);
}

/**
 * How many top finishers, PER CAMPUS bucket, earn a daily-leaderboard rank
 * bonus. Same per-campus fairness rationale as the early-bird limit.
 */
export const MINIGAME_RANK_BONUS_LIMIT = 3;

/**
 * Additive bonus (on top of {@link MINIGAME_XP_REWARD}) for a 1-based rank on the
 * campus board, ranked the moment the talent finishes. Podium-shaped, as
 * multiples of the base:
 *   rank 1 → +100 (x3)   rank 2 → +50 (x2)   rank 3 → +25 (x1.5)   else → 0
 * Steep enough that the top spot is clearly worth chasing day to day.
 */
export function minigameRankBonus(rank: number): number {
  if (rank < 1 || rank > MINIGAME_RANK_BONUS_LIMIT) return 0;
  if (rank === 1) return MINIGAME_XP_REWARD * 2;
  if (rank === 2) return MINIGAME_XP_REWARD;
  return Math.round(MINIGAME_XP_REWARD / 2);
}

export const DIFFICULTY_XP: Record<string, number> = {
  Débutant: 20,
  Intermédiaire: 45,
  Avancé: 75,
};

/**
 * Talent level tiers, derived purely from XP. Single source of truth — the
 * `Talent.level` column was dropped (it was never written and always read
 * 'Novice'). `JUMP_LEVELS` (used by the broadcast audience filter) and
 * `computeLevel` both flow from here so display, filtering, and DB stay
 * consistent. `maxExclusive: null` marks the open-ended top tier.
 */
export const JUMP_LEVELS = ['Novice', 'Apprentice', 'Expert'] as const;
export type JumpLevel = (typeof JUMP_LEVELS)[number];

export const XP_LEVEL_TIERS: {
  level: JumpLevel;
  min: number;
  maxExclusive: number | null;
}[] = [
  { level: 'Novice', min: 0, maxExclusive: 200 },
  { level: 'Apprentice', min: 200, maxExclusive: 500 },
  { level: 'Expert', min: 500, maxExclusive: null },
];

/**
 * Maps an XP total to its level tier. The only place levels are decided.
 */
export function computeLevel(xp: number): JumpLevel {
  if (xp >= 500) return 'Expert';
  if (xp >= 200) return 'Apprentice';
  return 'Novice';
}

/** French display labels for the talent-facing UI. */
export const LEVEL_LABELS_FR: Record<JumpLevel, string> = {
  Novice: 'Novice',
  Apprentice: 'Apprenti',
  Expert: 'Expert ✦',
};

/** Convenience: the French label for a given XP total. */
export function levelLabelFr(xp: number): string {
  return LEVEL_LABELS_FR[computeLevel(xp)];
}

/**
 * Resolves a level name back to its XP bounds — used by the broadcast filter to
 * translate a chosen tier into an `xp` range query now that `level` is no
 * longer a column. Falls back to the first tier for unknown names.
 */
export function xpRangeForLevel(level: string): {
  min: number;
  maxExclusive: number | null;
} {
  const tier = XP_LEVEL_TIERS.find((t) => t.level === level);
  return tier ?? XP_LEVEL_TIERS[0];
}

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
