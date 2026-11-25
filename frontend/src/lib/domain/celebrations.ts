/**
 * What the duck's stage plays (#540), worked out from what the talent earned:
 * each amount, the level bar it fills, and the level it reaches.
 *
 * An amount fills the bar of its level, so the bar is never shown alone: a bar
 * filling with nothing pouring into it read as a page loading. When an amount
 * takes the talent past a level, its bar fills to the end and the new level is
 * revealed from it, one gesture rather than an amount and then a level played
 * as two scenes. A level reached by XP that is not celebrated (an admin's
 * grant, a reward with no moment of its own) is revealed alone, with no bar.
 *
 * Each celebration carries what tells it from another (`key`) and the mark
 * that records it played (`ack`), so a page acknowledges exactly what it
 * plays, and a second reward of the same kind is never taken for the first.
 *
 * Pure, so the server stages what a page load finds owed
 * (`loadPendingCelebrations`) and the play page stages the win it has just
 * witnessed with the same rules.
 */
import {
  JUMP_LEVELS,
  computeLevel,
  levelProgress,
  levelReachedSince,
  xpRangeForLevel,
  type JumpLevel,
  type LevelTone,
} from './xp';
import type { CelebrationAck } from '#lib/validation/celebrations.ts';

/** The moments an amount of XP is celebrated at, each with its own line. */
export type XpMoment =
  'arrivalXp' | 'earlyArrivalXp' | 'activityXp' | 'rankXp' | 'dailyGameXp';

/** An amount earned and not yet celebrated. */
export type XpGain = {
  moment: XpMoment;
  xp: number;
  /** The early-arrival bonus within `xp`, for `earlyArrivalXp` only. */
  bonus?: number;
  /** What tells this amount from another of its moment (`xpGains`). */
  key: string;
  /** The mark that records it played. */
  ack: CelebrationAck;
};

/**
 * Each source's amount, with its identity and its mark. The one place they
 * are built, for the server's loader and the play page alike.
 */
export const xpGains = {
  /** The arrival's XP, marked by the one-shot cookie its load consumed. */
  arrival(xp: number, bonus: number): XpGain {
    return bonus > 0
      ? { moment: 'earlyArrivalXp', xp, bonus, key: 'arrival', ack: {} }
      : { moment: 'arrivalXp', xp, key: 'arrival', ack: {} };
  },
  /** Activity XP, up to the amount each activity has granted. */
  activity(
    xp: number,
    upTo: NonNullable<CelebrationAck['workshopUpTo']>,
  ): XpGain {
    const amounts = upTo
      .map(({ activityId, amount }) => `${activityId}=${amount}`)
      .sort();
    return {
      moment: 'activityXp',
      xp,
      key: `activity:${amounts.join(',')}`,
      ack: { workshopUpTo: upTo },
    };
  },
  /** A challenge won, by the publication its attempt belongs to. */
  daily(publicationId: string, xp: number): XpGain {
    return {
      moment: 'dailyGameXp',
      xp,
      key: `daily:${publicationId}`,
      ack: { daily: publicationId },
    };
  },
  /** A challenge's rank bonus, by the publication its attempt belongs to. */
  rank(publicationId: string, xp: number): XpGain {
    return {
      moment: 'rankXp',
      xp,
      key: `rank:${publicationId}`,
      ack: { rank: publicationId },
    };
  },
};

/** What tells a level's reveal from another, whatever reveals it. */
export function levelKey(level: JumpLevel): string {
  return `level:${level}`;
}

/** The stretch of a level's bar an amount fills, from 0 to 1. */
export type LevelBar = {
  level: JumpLevel;
  next: JumpLevel;
  from: number;
  to: number;
};

/** A level reached, revealed with its badge. */
export type ReachedLevel = { level: JumpLevel; tone: LevelTone };

export type XpCelebration = XpGain & {
  kind: 'xp';
  /** Null at the top level, where there is no further level to fill towards. */
  bar: LevelBar | null;
  /** The level this amount takes the talent to, revealed as its bar overflows. */
  reached: ReachedLevel | null;
};

/** A level reached by XP that has no celebration of its own. */
export type LevelCelebration = {
  kind: 'level';
  key: string;
  ack: CelebrationAck;
} & ReachedLevel;

export type Celebration = XpCelebration | LevelCelebration;

/**
 * The celebrations of `gains`, played in their order, for a talent now at
 * `xp` whose level was last celebrated at `levelCelebratedXp`.
 *
 * The amounts are taken as the last XP earned, so their stretches of bar are
 * counted back from `xp`: the bar shows where the talent stands, whatever else
 * moved the total. The level reached (`levelReachedSince`) is revealed by the
 * amount whose stretch crosses into it, else alone after them, and whichever
 * reveals it carries its mark: the total it was celebrated at (`levelUpTo`).
 */
export function stageCelebrations(
  gains: readonly XpGain[],
  { xp, levelCelebratedXp }: { xp: number; levelCelebratedXp: number },
): Celebration[] {
  const reached = levelReachedSince(levelCelebratedXp, xp);
  // The level reached is the one `xp` stands in.
  const tone = levelProgress(xp).tone;
  const spans: { before: number; after: number }[] = [];
  let after = xp;
  for (let i = gains.length - 1; i >= 0; i--) {
    const before = Math.max(0, after - gains[i].xp);
    spans[i] = { before, after };
    after = before;
  }
  const rank = (total: number) => JUMP_LEVELS.indexOf(computeLevel(total));
  const revealing = reached
    ? spans.findIndex(
        ({ before, after }) =>
          rank(before) < JUMP_LEVELS.indexOf(reached) &&
          rank(after) >= JUMP_LEVELS.indexOf(reached),
      )
    : -1;

  const items: Celebration[] = gains.map((gain, i) => {
    if (i !== revealing || reached === null) {
      return {
        kind: 'xp',
        ...gain,
        bar: barWithin(spans[i].before, spans[i].after),
        reached: null,
      };
    }
    return {
      kind: 'xp',
      ...gain,
      ack: { ...gain.ack, levelUpTo: xp },
      bar: barInto(reached, spans[i].before),
      reached: { level: reached, tone },
    };
  });
  if (reached && revealing === -1) {
    items.push({
      kind: 'level',
      level: reached,
      tone,
      key: levelKey(reached),
      ack: { levelUpTo: xp },
    });
  }
  return items;
}

/**
 * The marks of `items` as one acknowledgement: what a page sends once it has
 * queued them, so it marks what it plays and nothing it left out.
 */
export function ackOf(items: readonly Celebration[]): CelebrationAck {
  const ack: CelebrationAck = {};
  for (const { ack: mark } of items) {
    if (mark.workshopUpTo) {
      ack.workshopUpTo = [...(ack.workshopUpTo ?? []), ...mark.workshopUpTo];
    }
    if (mark.daily) ack.daily = mark.daily;
    if (mark.rank) ack.rank = mark.rank;
    if (mark.levelUpTo !== undefined) {
      ack.levelUpTo = Math.max(ack.levelUpTo ?? 0, mark.levelUpTo);
    }
  }
  return ack;
}

/**
 * The bar of the level an amount ends in, filled from where it started: from
 * the start of the level when the amount came from below it.
 */
function barWithin(before: number, after: number): LevelBar | null {
  const now = levelProgress(after);
  if (!now.next) return null;
  return {
    level: now.level,
    next: now.next.level,
    from: before >= now.min ? levelProgress(before).ratio : 0,
    to: now.ratio,
  };
}

/** The bar of the level just under `reached`, filled to its end. */
function barInto(reached: JumpLevel, before: number): LevelBar {
  const left = JUMP_LEVELS[JUMP_LEVELS.indexOf(reached) - 1];
  const { min } = xpRangeForLevel(left);
  const end = xpRangeForLevel(reached).min;
  return {
    level: left,
    next: reached,
    from: before >= min ? (before - min) / (end - min) : 0,
    to: 1,
  };
}
