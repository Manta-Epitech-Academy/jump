/**
 * What the talent has earned and not yet seen celebrated (#540): the XP of
 * each source and the level they reached, in the order the duck's stage plays
 * them (`MascotStage`), with what marks each one played once it is shown.
 *
 * One loader for every page that celebrates, so a reward is celebrated on the
 * first of them the talent opens and never twice. Each source keeps its own
 * mark, raised only: an activity's `xpCelebrated`, a challenge's `xpSeenAt`
 * and `rankXpSeenAt`, the arrival's one-shot cookie, and the level's
 * `Talent.levelCelebratedXp`.
 */
import type { Cookies } from '@sveltejs/kit';
import { prisma } from '#lib/server/db.ts';
import { consumeArrivalCelebration } from '#lib/server/talent/arrivalCelebration.ts';
import {
  getUnseenWorkshopReward,
  markWorkshopRewardsSeen,
} from '#lib/server/services/workshopService.ts';
import {
  getUnseenMinigameRankReward,
  getUnseenMinigameReward,
  markMinigameRankRewardsSeen,
  markMinigameRewardsSeen,
} from '#lib/server/services/minigameService.ts';
import {
  WELCOME_XP_BONUS,
  levelProgress,
  levelReachedSince,
  type JumpLevel,
  type LevelTone,
} from '#lib/domain/xp.ts';
import type { CelebrationAck } from '#lib/validation/celebrations.ts';

/** XP the stage floats, said with the line of their own moment. */
export type XpCelebration = {
  kind: 'xp';
  moment:
    'arrivalXp' | 'earlyArrivalXp' | 'activityXp' | 'rankXp' | 'dailyGameXp';
  xp: number;
  /** The early-arrival bonus within `xp`, for `earlyArrivalXp` only. */
  bonus?: number;
};

/**
 * A level reached: the bar of the level left fills from where it was last
 * celebrated, then the new one is revealed.
 */
export type LevelCelebration = {
  kind: 'level';
  level: JumpLevel;
  tone: LevelTone;
  /** How far through the level left the bar starts, from 0 to 1. */
  fromRatio: number;
};

export type Celebration = XpCelebration | LevelCelebration;

export type PendingCelebrations = {
  items: Celebration[];
  /** Everything `items` shows, for `ackCelebrations` to mark played. */
  ack: CelebrationAck;
};

/**
 * What the talent has to see celebrated, or null. Consumes the arrival's
 * one-shot cookie, so it is called by a page load that shows the stage.
 */
export async function loadPendingCelebrations(
  talent: { id: string; xp: number; levelCelebratedXp: number },
  cookies: Cookies,
): Promise<PendingCelebrations | null> {
  const [arrival, workshop, rank, daily] = await Promise.all([
    consumeArrivalCelebration(cookies) ? arrivalXp(talent.id) : null,
    getUnseenWorkshopReward(talent.id),
    getUnseenMinigameRankReward(talent.id),
    getUnseenMinigameReward(talent.id),
  ]);

  const items: Celebration[] = [];
  const ack: CelebrationAck = { minigame: [] };
  if (arrival) items.push(arrival);
  if (workshop) {
    items.push({ kind: 'xp', moment: 'activityXp', xp: workshop.xp });
    ack.workshopUpTo = workshop.upTo;
  }
  if (rank) {
    items.push({ kind: 'xp', moment: 'rankXp', xp: rank.xp });
    ack.minigame.push('rank');
  }
  if (daily) {
    items.push({ kind: 'xp', moment: 'dailyGameXp', xp: daily.xp });
    ack.minigame.push('base');
  }
  // Last, so the XP that led there are seen first.
  const level = levelReachedSince(talent.levelCelebratedXp, talent.xp);
  if (level) {
    items.push({
      kind: 'level',
      level,
      tone: levelProgress(talent.xp).tone,
      fromRatio: levelProgress(talent.levelCelebratedXp).ratio,
    });
    ack.levelUpTo = talent.xp;
  }
  return items.length > 0 ? { items, ack } : null;
}

/** The arrival's XP, the early-arrival bonus read off its grant. */
async function arrivalXp(talentId: string): Promise<XpCelebration> {
  const earlyBird = await prisma.xpGrant.findUnique({
    where: {
      source_sourceId: { source: 'onboarding_early_bird', sourceId: talentId },
    },
    select: { amount: true },
  });
  const bonus = earlyBird?.amount ?? 0;
  return bonus > 0
    ? {
        kind: 'xp',
        moment: 'earlyArrivalXp',
        xp: WELCOME_XP_BONUS + bonus,
        bonus,
      }
    : { kind: 'xp', moment: 'arrivalXp', xp: WELCOME_XP_BONUS };
}

/**
 * Mark what the stage showed as played, each mark only ever raised, so a
 * second call or a stale tab changes nothing.
 */
export async function markCelebrationsPlayed(
  talentId: string,
  ack: CelebrationAck,
): Promise<void> {
  await Promise.all([
    ack.workshopUpTo && markWorkshopRewardsSeen(talentId, ack.workshopUpTo),
    ack.minigame.includes('base') && markMinigameRewardsSeen(talentId),
    ack.minigame.includes('rank') && markMinigameRankRewardsSeen(talentId),
    ack.levelUpTo !== undefined &&
      prisma.talent.updateMany({
        where: { id: talentId, levelCelebratedXp: { lt: ack.levelUpTo } },
        data: { levelCelebratedXp: ack.levelUpTo },
      }),
  ]);
}
