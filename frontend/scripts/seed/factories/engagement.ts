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
export function addMinigamePublications(
  world: World,
  forcedBy: StaffRef | null = null,
): string[] {
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
        // One publication put in play by hand rather than by the rotation.
        // `forcedById` names who overrode it, and the rotation screen says so;
        // with no such row that whole branch renders nowhere.
        forcedById: index === 0 && level === 1 ? forcedBy?.userId : undefined,
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
    /** Set when the run happened during an event rather than from home. */
    event?: EventRef;
    /**
     * Whether the talent has already seen the "+XP" float. Both states matter:
     * null is a fresh win still to be celebrated and gates a one-shot animation,
     * so a dataset where every attempt is unseen replays the celebration on
     * every dashboard open and never shows the settled state.
     */
    xpSeen?: boolean;
    /** A score-type game reports a score; a chrono-type one reports a time. */
    scored?: boolean;
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

  const playedAt = clock.days(-opts.index - 1);
  const rankBonus =
    finished &&
    opts.rank &&
    opts.fieldSize &&
    opts.rank <= minigameRankBonusLimit(opts.fieldSize)
      ? minigameRankBonus(opts.rank, opts.fieldSize)
      : 0;

  world.buffer.minigameAttempt.push({
    id: attemptId,
    talentId: opts.talent.id,
    publicationId: opts.publicationId,
    // A snapshot, deliberately unbound: it records the campus the run happened
    // on, not one that tracks the talent afterwards.
    campusId: opts.talent.campusId,
    eventId: opts.event?.id ?? null,
    status: opts.status,
    score: finished && opts.scored ? rng.int(120, 9800) : null,
    chrono: finished && !opts.scored ? rng.int(45, 600) : null,
    valid: finished ? true : opts.status === 'invalid' ? false : null,
    startedAt: playedAt,
    finishedAt: finished ? playedAt : null,
    jti: id('jti', seq(opts.index, 6), opts.talent.id.replace(/^sd_/, '')),
    xpAwarded: finished ? MINIGAME_XP_REWARD : null,
    xpSeenAt: finished && opts.xpSeen ? playedAt : null,
    rankXpAwarded: rankBonus > 0 ? rankBonus : null,
    rankXpSeenAt: rankBonus > 0 && opts.xpSeen ? playedAt : null,
  });

  if (!finished) return;

  world.grantXp({
    talent: opts.talent,
    source: 'minigame',
    sourceId: attemptId,
    amount: MINIGAME_XP_REWARD,
  });

  if (rankBonus > 0) {
    world.grantXp({
      talent: opts.talent,
      source: 'minigame_rank',
      sourceId: attemptId,
      amount: rankBonus,
    });
  }
}

/**
 * The scoreboard rewards, and the grants that hang off them.
 *
 * Two things vary across the catalogue and both are states a screen renders.
 * A reward can belong to one campus or to the whole platform, and a reward that
 * has not been handed out yet carries no date - which is what the board shows
 * as « pas encore attribué ». Writing one campus and one date onto every row
 * left both of those unreachable.
 */
export function addXpRewards(world: World, campusId: string | null): void {
  for (const [index, reward] of XP_REWARDS.entries()) {
    world.buffer.xpReward.push({
      id: id('xpr', reward.key),
      key: reward.key,
      name: reward.name,
      xpAmount: reward.xpAmount,
      campusId: index % 2 === 0 ? campusId : null,
      awardedOn: index === 1 ? null : world.ctx.clock.days(-25),
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
 *
 * The other 38 are not, and the three optional shapes below are the ones the
 * feed actually has to render. A note written from the talent fiche carries no
 * event and no slot. A note somebody has since edited carries `editedById`, and
 * the feed renders « modifiée par » from it. And a note whose author has left
 * carries no author at all: the foreign key is `SetNull` precisely so the note
 * survives the departure, and `FORMER_STAFF_LABEL` is what every screen prints
 * in their place.
 */
export function addTalentNote(
  world: World,
  opts: {
    talent: TalentRef;
    /** Null for a note whose author has since been deleted. */
    author: StaffRef | null;
    /** Omitted for a note written from the fiche rather than from émargement. */
    event?: EventRef;
    day?: Date;
    slot?: 'morning' | 'afternoon';
    editedBy?: StaffRef;
    index: number;
  },
): void {
  const writtenAt = opts.day ?? world.ctx.clock.days(-opts.index - 1);
  world.buffer.note_TalentNote.push({
    id: id('ntn', opts.talent.id.replace(/^sd_/, ''), seq(opts.index, 2)),
    talentId: opts.talent.id,
    authorId: opts.author?.id ?? null,
    body: world.ctx.rng.pick(NOTE_BODIES),
    eventId: opts.event?.id ?? null,
    presenceDay: opts.day ?? null,
    presenceSlot: opts.slot ?? null,
    editedById: opts.editedBy?.id ?? null,
    createdAt: writtenAt,
  });
}
