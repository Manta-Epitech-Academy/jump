/**
 * What a talent does on the platform: minigames, the XP those grant, the
 * scoreboard rewards, and the notes staff leave about them.
 *
 * The XP shape follows PROFILE.md rather than intuition. `reward` is the largest
 * source by a wide margin (1.19M of 1.62M granted, individual grants up to
 * 1800), `minigame` is a flat 50, `minigame_rank` is 10 to 100, and 72% of
 * talents have no XP at all. A dataset where everyone has a little XP produces a
 * leaderboard that nobody at Epitech would recognise, and hides the empty states
 * that most talents actually see.
 */

import type { MinigameAttemptStatus } from '@prisma/client';
import {
  MINIGAME_XP_REWARD,
  minigameRankBonus,
  minigameRankBonusLimit,
} from '../../../src/lib/domain/xp';
import { MINIGAMES, XP_REWARDS } from '../catalog/platform';
import type { World, TalentRef, StaffRef, EventRef } from '../world';
import { id, seq } from '../ids';

/** The rotation. `MinigameConfig` is curation and is written by the catalogue. */
export function addMinigamePublications(world: World): string[] {
  const published: string[] = [];
  for (const [index, game] of MINIGAMES.entries()) {
    for (let level = 1; level <= Math.min(2, game.levels); level += 1) {
      const publicationId = id('mgp', game.game, String(level));
      world.buffer.minigamePublication.push({
        id: publicationId,
        game: game.game,
        gameName: game.gameName,
        level,
        scoringType: game.scoringType,
        publishedAt: world.ctx.clock.days(-index * 7 - level),
      });
      published.push(publicationId);
    }
  }
  return published;
}

/**
 * One attempt, and the XP it earns.
 *
 * A finished attempt grants a flat 50 and, when it ranks, a bonus computed by
 * the domain rather than restated here. `pending` and `invalid` are seeded too:
 * they are a third of the attempts in production, and a screen that only ever
 * saw finished runs would never show its own loading and refusal states.
 */
export function addMinigameAttempt(
  world: World,
  opts: {
    talent: TalentRef;
    publicationId: string;
    status: MinigameAttemptStatus;
    rank?: number;
    fieldSize?: number;
    index: number;
  },
): void {
  const clock = world.ctx.clock;
  const rng = world.ctx.rng;
  const attemptId = id(
    'mga',
    opts.talent.id.replace(/^sd_/, ''),
    opts.publicationId.replace(/^sd_/, ''),
  );
  const finished = opts.status === 'done';

  world.buffer.minigameAttempt.push({
    id: attemptId,
    talentId: opts.talent.id,
    publicationId: opts.publicationId,
    campusId: opts.talent.campusId,
    status: opts.status,
    chrono: finished ? rng.int(45, 600) : null,
    valid: finished ? true : opts.status === 'invalid' ? false : null,
    startedAt: clock.days(-opts.index - 1),
    finishedAt: finished ? clock.days(-opts.index - 1) : null,
    jti: id('jti', seq(opts.index, 6), opts.talent.id.replace(/^sd_/, '')),
    xpAwarded: finished ? MINIGAME_XP_REWARD : null,
  });

  if (!finished) return;

  world.grantXp({
    talent: opts.talent,
    source: 'minigame',
    sourceId: attemptId,
    amount: MINIGAME_XP_REWARD,
  });

  if (
    opts.rank &&
    opts.fieldSize &&
    opts.rank <= minigameRankBonusLimit(opts.fieldSize)
  ) {
    const bonus = minigameRankBonus(opts.rank, opts.fieldSize);
    if (bonus > 0) {
      world.grantXp({
        talent: opts.talent,
        source: 'minigame_rank',
        sourceId: attemptId,
        amount: bonus,
      });
    }
  }
}

/** The scoreboard rewards, and the grants that hang off them. */
export function addXpRewards(world: World, campusId: string | null): void {
  for (const reward of XP_REWARDS) {
    world.buffer.xpReward.push({
      id: id('xpr', reward.key),
      key: reward.key,
      name: reward.name,
      xpAmount: reward.xpAmount,
      campusId,
      awardedOn: world.ctx.clock.days(-25),
    });
  }
}

export function grantReward(
  world: World,
  talent: TalentRef,
  rewardKey: string,
  amount: number,
): void {
  world.grantXp({
    talent,
    source: 'reward',
    // The app keys a reward grant on `${rewardId}_${talentId}`; the same shape
    // here keeps the unique constraint on (source, sourceId) meaningful.
    sourceId: `${id('xpr', rewardKey)}_${talent.id}`,
    amount,
  });
}

const NOTE_BODIES = [
  'Arrivé en retard le matin, prévenu par les parents.',
  'A demandé des informations sur le parcours après le bac.',
  'Très moteur pendant l’atelier, aide les autres spontanément.',
  'Absent l’après-midi, justificatif transmis.',
];

/**
 * A staff note. Almost all of them (197 of 235) are attached to an event AND to
 * a presence slot in production: the note is born from the émargement screen,
 * not from a standalone form.
 */
export function addTalentNote(
  world: World,
  opts: {
    talent: TalentRef;
    author: StaffRef;
    event: EventRef;
    day: Date;
    slot: 'morning' | 'afternoon';
    index: number;
  },
): void {
  world.buffer.note_TalentNote.push({
    id: id('ntn', opts.talent.id.replace(/^sd_/, ''), seq(opts.index, 2)),
    talentId: opts.talent.id,
    authorId: opts.author.id,
    body: world.ctx.rng.pick(NOTE_BODIES),
    eventId: opts.event.id,
    presenceDay: opts.day,
    presenceSlot: opts.slot,
    createdAt: opts.day,
  });
}
