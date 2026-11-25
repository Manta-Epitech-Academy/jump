/**
 * What the talent has earned and not yet seen celebrated (#540): the XP of
 * each source, in the order the duck's stage plays them (`MascotStage`), the
 * level they reached revealed by the amount that crossed into it
 * (`stageCelebrations`), and what marks each one played once it is shown.
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
import { WELCOME_XP_BONUS } from '#lib/domain/xp.ts';
import {
  stageCelebrations,
  xpGains,
  type Celebration,
  type XpGain,
} from '#lib/domain/celebrations.ts';
import type { CelebrationAck } from '#lib/validation/celebrations.ts';

/**
 * What the talent has to see celebrated, in the order the stage plays it,
 * each item with its mark (`ackOf`). Empty when nothing is owed. Consumes the
 * arrival's one-shot cookie, so it is called by a page load that shows the
 * stage.
 */
export async function loadPendingCelebrations(
  talent: { id: string; xp: number; levelCelebratedXp: number },
  cookies: Cookies,
): Promise<Celebration[]> {
  const [arrival, workshop, rank, daily] = await Promise.all([
    consumeArrivalCelebration(cookies) ? arrivalXp(talent.id) : null,
    getUnseenWorkshopReward(talent.id),
    getUnseenMinigameRankReward(talent.id),
    getUnseenMinigameReward(talent.id),
  ]);

  const gains: XpGain[] = [];
  if (arrival) gains.push(arrival);
  if (workshop) gains.push(xpGains.activity(workshop.xp, workshop.upTo));
  // The challenge's reward before its rank bonus, the order they are granted
  // in: the amounts are counted back from the total, so the one that crossed
  // into a level is the one that reveals it.
  if (daily) gains.push(xpGains.daily(daily.publicationId, daily.xp));
  if (rank) gains.push(xpGains.rank(rank.publicationId, rank.xp));
  return stageCelebrations(gains, talent);
}

/** The arrival's XP, the early-arrival bonus read off its grant. */
async function arrivalXp(talentId: string): Promise<XpGain> {
  const earlyBird = await prisma.xpGrant.findUnique({
    where: {
      source_sourceId: { source: 'onboarding_early_bird', sourceId: talentId },
    },
    select: { amount: true },
  });
  const bonus = earlyBird?.amount ?? 0;
  return xpGains.arrival(WELCOME_XP_BONUS + bonus, bonus);
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
    ack.daily && markMinigameRewardsSeen(talentId, ack.daily),
    ack.rank && markMinigameRankRewardsSeen(talentId, ack.rank),
    ack.levelUpTo !== undefined &&
      prisma.talent.updateMany({
        where: { id: talentId, levelCelebratedXp: { lt: ack.levelUpTo } },
        data: { levelCelebratedXp: ack.levelUpTo },
      }),
  ]);
}
