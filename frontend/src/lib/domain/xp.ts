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
 * performance reward, see `minigameRankBonus`).
 *
 * The amount was chosen to sit below the old per-activity difficulty scale, which
 * was retired with event-linked presence XP (5fb78617): there is no longer an
 * activity grant for a daily game to out-earn. It is kept where it is because the
 * balance against `reward` and `minigameRankBonus` still holds.
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
 * The five Jump levels, lowest first, derived purely from XP and never stored
 * (`Talent.level` was dropped), and never shown in the dev workspace. This
 * tuple fixes their order; it stays a literal because `z.enum` needs one for
 * the broadcast audience filter.
 */
export const JUMP_LEVELS = [
  'Explorer',
  'Maker',
  'Hacker',
  'Builder',
  'Expert',
] as const;
export type JumpLevel = (typeof JUMP_LEVELS)[number];

/**
 * The colours of a level's badge, one per level of the 2027 mockup: a fill from
 * the brand palette, and the ring and star that read on it. The talent space
 * draws it (`LevelBadge`); the tier only names it, so a level's look is decided
 * here with its threshold rather than in a component.
 */
export type LevelTone = 'tech' | 'together' | 'tomorrow' | 'blue' | 'dark';

/**
 * Where each level starts, its colour, and the line a talent reads under its
 * name. The only place a threshold is written: every bound, the level of an XP
 * total and the progress towards the next one are read off this table, keyed
 * by level so that a level without its row does not compile. Thresholds, tones
 * and lines come from the 2027 mockup (#446); the PO set them on 27/10/2026.
 * They count every XP alike, whatever earned it.
 */
const JUMP_LEVEL_TIERS: Record<
  JumpLevel,
  { min: number; tone: LevelTone; tagline: string }
> = {
  Explorer: {
    min: 0,
    tone: 'tech',
    tagline: 'Tu découvres le code et le campus.',
  },
  Maker: {
    min: 2500,
    tone: 'together',
    tagline: 'Tu crées tes premiers projets.',
  },
  Hacker: {
    min: 10000,
    tone: 'tomorrow',
    tagline: 'Tu relèves des défis techniques.',
  },
  Builder: {
    min: 25000,
    tone: 'blue',
    tagline: 'Tu mènes des projets ambitieux.',
  },
  Expert: {
    min: 50000,
    tone: 'dark',
    tagline: 'Tu maîtrises et tu transmets.',
  },
};

export type LevelStep = {
  level: JumpLevel;
  min: number;
  tone: LevelTone;
  tagline: string;
};

/**
 * Every level, lowest first, with where it starts, its colour and its line:
 * the row of levels Mon parcours keeps in sight under the talent's own.
 */
export function levelLadder(): LevelStep[] {
  return JUMP_LEVELS.map((level) => ({ level, ...JUMP_LEVEL_TIERS[level] }));
}

/** The level after `level`, or null at the top. */
function nextLevel(level: JumpLevel): JumpLevel | null {
  return JUMP_LEVELS[JUMP_LEVELS.indexOf(level) + 1] ?? null;
}

/** The level an XP total has reached. A negative total is the first. */
export function computeLevel(xp: number): JumpLevel {
  let reached: JumpLevel = JUMP_LEVELS[0];
  for (const level of JUMP_LEVELS) {
    if (xp >= JUMP_LEVEL_TIERS[level].min) reached = level;
  }
  return reached;
}

export type LevelProgress = {
  level: JumpLevel;
  tone: LevelTone;
  tagline: string;
  min: number;
  /** Null at the top level: there is nothing further to announce. */
  next: { level: JumpLevel; min: number; xpToGo: number } | null;
  /** How far through the current level, from 0 to 1; 1 at the top. */
  ratio: number;
};

/**
 * Where an XP total stands in its level: the level with its badge and line,
 * the level after it (null at the top) with the XP left to reach it, and how
 * far along towards it. Talent-facing only: the dev workspace never shows a
 * level.
 */
export function levelProgress(xp: number): LevelProgress {
  const level = computeLevel(xp);
  const { min, tone, tagline } = JUMP_LEVEL_TIERS[level];
  const following = nextLevel(level);
  if (!following) return { level, tone, tagline, min, next: null, ratio: 1 };
  const nextMin = JUMP_LEVEL_TIERS[following].min;
  return {
    level,
    tone,
    tagline,
    min,
    next: { level: following, min: nextMin, xpToGo: nextMin - xp },
    ratio: Math.min(1, Math.max(0, (xp - min) / (nextMin - min))),
  };
}

/**
 * The XP bounds of a level: from its own threshold up to the next level's,
 * open-ended at the top (`maxExclusive: null`).
 */
export function xpRangeForLevel(level: JumpLevel): {
  min: number;
  maxExclusive: number | null;
} {
  const following = nextLevel(level);
  return {
    min: JUMP_LEVEL_TIERS[level].min,
    maxExclusive: following ? JUMP_LEVEL_TIERS[following].min : null,
  };
}

/**
 * A level's bounds as a filter on `Talent.xp`. A plain shape that Prisma's
 * `IntFilter` accepts, so the broadcast audience and the engagement figures
 * count a level with the same bounds.
 */
export function levelXpFilter(level: JumpLevel): { gte: number; lt?: number } {
  const { min, maxExclusive } = xpRangeForLevel(level);
  return maxExclusive === null ? { gte: min } : { gte: min, lt: maxExclusive };
}

/**
 * The sentence under a level's bar, in the 2027 mockup's words: the XP left
 * before the next level, or that there is none. One function, so the home card
 * and Mon parcours say the same thing.
 */
export function levelToNext(progress: LevelProgress): string {
  return progress.next
    ? `${progress.next.xpToGo.toLocaleString('fr-FR')} XP avant le niveau ${progress.next.level}`
    : 'Niveau maximum atteint';
}
