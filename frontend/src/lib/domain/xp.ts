/**
 * One-off XP granted when a talent finishes onboarding (the arrival
 * celebration shown on the dashboard). Granted in
 * `(talent)/onboarding/+page.server.ts` and refunded by the admin
 * onboarding-reset in `services/talentAccount.ts`. The base; earliest finishers
 * earn an additional `onboardingEarlyBirdBonus` on top (see below).
 */
export const WELCOME_XP_BONUS = 200;

/**
 * XP granted for finishing the daily minigame. Flat: it rewards showing up and
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
 * The rank-bonus pool, as a fraction of the field that actually competed on the
 * board. Cohort-relative on purpose: a flat top-3 was top 3% at a ~100-strong
 * campus but top ~12% at La Reunion's ~26, so one constant rewarded wildly
 * different shares. Scaling by the field equalises that share across campuses
 * with no roster lookup: the denominator is exactly the board the rank is
 * measured against. 0.1 is roughly the top ten at a full stage cohort.
 */
const MINIGAME_RANK_BONUS_FRACTION = 0.1;

/**
 * Floor on the pool, so the three podium tiers below always pay out even on a
 * tiny board (an empty or single-digit field still has a podium). At La Reunion's
 * ~26 the fraction already rounds to this floor, so the small campus keeps its
 * top-3 podium while a 100-strong one opens up to ~10 slots.
 */
const MINIGAME_RANK_BONUS_MIN_LIMIT = 3;

/**
 * How many top finishers earn a rank bonus, given the size of the field they
 * finished against ({@link MINIGAME_RANK_BONUS_FRACTION} of it, never fewer than
 * the {@link MINIGAME_RANK_BONUS_MIN_LIMIT} podium slots). Evaluated the instant a
 * talent finishes, against the board so far: the same no-clawback "moment you
 * finished" semantics as the rank itself.
 */
export function minigameRankBonusLimit(fieldSize: number): number {
  return Math.max(
    MINIGAME_RANK_BONUS_MIN_LIMIT,
    Math.ceil(fieldSize * MINIGAME_RANK_BONUS_FRACTION),
  );
}

/**
 * Additive bonus (on top of {@link MINIGAME_XP_REWARD}) for a 1-based rank on the
 * campus board, against a field of `fieldSize` finishers. A steep podium plus a
 * flat honourable-mention tail out to {@link minigameRankBonusLimit}, as multiples
 * of the base:
 *   rank 1 → +100 (x2)   rank 2 → +50 (x1)   rank 3 → +25 (x0.5)
 *   rank 4..limit → +10 (x0.2, the top-decile nod)   else → 0
 * The podium stays steep so the top spot is clearly worth chasing day to day; the
 * tail only widens *who* gets recognised, it never dilutes the medals.
 */
export function minigameRankBonus(rank: number, fieldSize: number): number {
  if (rank < 1 || rank > minigameRankBonusLimit(fieldSize)) return 0;
  if (rank === 1) return MINIGAME_XP_REWARD * 2;
  if (rank === 2) return MINIGAME_XP_REWARD;
  if (rank === 3) return Math.round(MINIGAME_XP_REWARD / 2);
  return Math.round(MINIGAME_XP_REWARD / 5);
}

/**
 * Talent level tiers, derived purely from XP. Single source of truth: the
 * `Talent.level` column was dropped (it was never written and always read
 * 'Novice'). `JUMP_LEVELS` (used by the broadcast audience filter) and
 * `computeLevel` both flow from here so display, filtering, and DB stay
 * consistent. `maxExclusive: null` marks the open-ended top tier.
 */
export const JUMP_LEVELS = ['Novice', 'Apprentice', 'Expert'] as const;
export type JumpLevel = (typeof JUMP_LEVELS)[number];

const XP_LEVEL_TIERS: {
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

/**
 * Staff-facing one-liner explaining what XP means, shown as the hover tooltip
 * wherever the dev workspace surfaces a talent's XP (cohort table, directory,
 * fiche). Kept here, beside the XP rules, so the three surfaces share one copy
 * and it can never drift between them.
 */
export const XP_EXPLAINER_FR =
  "Les XP mesurent l'engagement du stagiaire sur JUMP : il en gagne en s'entraînant régulièrement (mini-jeux quotidiens), en participant aux événements et en complétant son onboarding.";

/**
 * Resolves a level name back to its XP bounds, used by the broadcast filter to
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
