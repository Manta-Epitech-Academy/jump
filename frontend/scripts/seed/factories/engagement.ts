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
import { MINIGAME_XP_REWARD } from '../../../src/lib/domain/xp';
import { MINIGAMES, XP_REWARDS } from '../catalog/platform';
import type {
  World,
  TalentRef,
  StaffRef,
  EventRef,
  MinigamePublicationRef,
} from '../world';
import { id, seq } from '../ids';

/**
 * How many days of rotation the calendar covers, and how many games land on
 * each.
 *
 * Both from PROFILE.md: 72 publications over 39 days, 13 days carrying one
 * game, 23 carrying two, then one day each at three, four and six. It is a
 * CALENDAR and not a volume, so no profile scales it - `ci` and `staging` see
 * the same rotation, and only the number of people playing it differs.
 *
 * The old shape was a ladder of every game at its first two levels: 16 rows,
 * `publishedAt` a week apart. That is not a smaller version of the rotation,
 * it is a different thing, and the difference was load-bearing in one specific
 * way: `MinigameAttempt` is unique on `(talentId, publicationId)`, so sixteen
 * publications made sixteen the most games anybody could ever have played.
 * Production's heaviest players have 44. The talents who carry the top of the
 * XP distribution are exactly those players, so the ceiling on publications was
 * also the ceiling on XP, and it is why the generated leaderboard topped out at
 * 2 050 against production's 9 190.
 */
const PUBLICATION_DAYS = 39;
const PUBLICATIONS_PER_DAY_MIX = [
  [1, 13],
  [2, 23],
  [3, 1],
  [4, 1],
  [6, 1],
] as const;

/**
 * The rotation, as a daily calendar. `MinigameConfig` is curation and is
 * written by the catalogue.
 *
 * Games are drawn on their rotation weight, the same weight the catalogue hands
 * `MinigameConfig`, and that includes the one game the catalogue switches OFF.
 * Deliberately: `enabled` is what is in play TODAY and a publication is
 * history, so a game published before the host retired it is a real state and
 * the only one that exercises reading a publication whose game is no longer in
 * rotation. Nothing republishes it after the fact.
 */
export function addMinigamePublications(
  world: World,
  forcedBy: StaffRef | null = null,
): MinigamePublicationRef[] {
  const { rng, clock } = world.ctx;
  const published: MinigamePublicationRef[] = [];

  for (let day = 1; day <= PUBLICATION_DAYS; day += 1) {
    const publishedAt = clock.days(-day);
    const dayKey = clock.dateKey(publishedAt);
    const perDay = rng.weighted(PUBLICATIONS_PER_DAY_MIX);
    // Distinct within a day: the same game at the same level twice on one day
    // is a row the rotation cannot produce, and the id would collide anyway.
    const takenToday = new Set<string>();

    for (let slot = 0; slot < perDay; slot += 1) {
      const game = rng.weighted(MINIGAMES.map((g) => [g, g.weight] as const));
      const level = rng.int(1, game.levels);
      const pairKey = `${game.game}-${level}`;
      if (takenToday.has(pairKey)) continue;
      takenToday.add(pairKey);

      const publicationId = id('mgp', dayKey, game.game, String(level));
      world.buffer.minigamePublication.push({
        id: publicationId,
        game: game.game,
        gameName: game.gameName,
        level,
        scoringType: game.scoringType,
        // One publication put in play by hand rather than by the rotation.
        // `forcedById` names who overrode it, and the rotation screen says so;
        // with no such row that whole branch renders nowhere. The oldest day,
        // so it is not the one a « jeu du jour » screen opens on.
        forcedById:
          day === PUBLICATION_DAYS && slot === 0 ? forcedBy?.userId : undefined,
        publishedAt,
      });
      published.push({
        id: publicationId,
        game: game.game,
        scoringType: game.scoringType,
        publishedAt,
      });
    }
  }

  return published;
}

/**
 * One attempt, and the flat XP finishing it earns.
 *
 * `pending` and `invalid` are seeded too: they are a third of the attempts in
 * production, and a screen that only ever saw finished runs would never show
 * its own loading and refusal states.
 *
 * **It writes no rank.** A rank is a property of the field a run finished in,
 * so `World.finalize` computes every one of them once, after every scenario has
 * buffered its attempts - see `rankMinigameFields`. What a caller controls here
 * is the RESULT: `standing` says how good it was, and coming first follows from
 * being fast rather than from being told so.
 */
export function addMinigameAttempt(
  world: World,
  opts: {
    talent: TalentRef;
    publication: MinigamePublicationRef;
    status: MinigameAttemptStatus;
    /** Set when the run happened during an event rather than from home. */
    event?: EventRef;
    /**
     * Whether the talent has already seen the "+XP" float. Both states matter:
     * null is a fresh win still to be celebrated and gates a one-shot animation,
     * so a dataset where every attempt is unseen replays the celebration on
     * every dashboard open and never shows the settled state.
     */
    xpSeen?: boolean;
    /**
     * How well it went, from 0 (worst result the game reports) to 1 (best).
     * Left out means an ordinary run, drawn from the middle of the range.
     * A placed profile passes 1 for the runs it is meant to win.
     */
    standing?: number;
    /**
     * Minute of the publication day this run finished on, when the ORDER of
     * finishes is the point rather than a draw. The rank bonus is the rank held
     * at the moment of finishing and is never revised, so on a board whose
     * shape is placed - a crowded one, say - who finished when is a fact the
     * scenario has to own. Left out means a drawn hour, like everybody else.
     */
    minuteOfDay?: number;
  },
): void {
  const rng = world.ctx.rng;
  // Throws on a second run by this talent on this publication, which the schema
  // forbids and which three separate writers could otherwise produce between
  // them.
  world.notePlayed(opts.talent.id, opts.publication.id);
  const attemptId = id(
    'mga',
    opts.talent.id.replace(/^sd_/, ''),
    opts.publication.id.replace(/^sd_/, ''),
  );
  const finished = opts.status === 'done';
  const scored = opts.publication.scoringType === 'score';

  // Played the day it was published, which is what a « jeu du jour » is, at an
  // hour of that day rather than at its midnight.
  //
  // The time of day is not decoration: the rank bonus the application pays is
  // the rank you held THE MOMENT you finished, never revised afterwards (see
  // `rankMinigameFields`, and `minigameService`'s own comment on no clawback).
  // So who finished before whom is what decides who got paid, and a board whose
  // every run is stamped at midnight has no such order - the generator would be
  // inventing one, and a different one on every read.
  const playedAt = new Date(
    opts.publication.publishedAt.getTime() +
      (opts.minuteOfDay ?? rng.int(8 * 60, 22 * 60)) * 60_000,
  );
  // A chrono game reports seconds and lower is better, a score game reports
  // points and higher is better, so `standing` is mapped through each one's own
  // direction rather than written as a raw number the caller has to reason
  // about.
  const standing = opts.standing ?? rng.next() * 0.8 + 0.1;
  const CHRONO_BEST = 45;
  const CHRONO_WORST = 600;
  const SCORE_WORST = 120;
  const SCORE_BEST = 9800;

  world.buffer.minigameAttempt.push({
    id: attemptId,
    talentId: opts.talent.id,
    publicationId: opts.publication.id,
    // A snapshot, deliberately unbound: it records the campus the run happened
    // on, not one that tracks the talent afterwards.
    campusId: opts.talent.campusId,
    eventId: opts.event?.id ?? null,
    status: opts.status,
    score:
      finished && scored
        ? Math.round(SCORE_WORST + (SCORE_BEST - SCORE_WORST) * standing)
        : null,
    chrono:
      finished && !scored
        ? Math.round(CHRONO_WORST - (CHRONO_WORST - CHRONO_BEST) * standing)
        : null,
    valid: finished ? true : opts.status === 'invalid' ? false : null,
    startedAt: playedAt,
    finishedAt: finished ? playedAt : null,
    // Derived from the attempt, not from a caller's loop counter. `jti` carries
    // its own unique index, and a counter that restarts in every writer
    // collides across them: the flagship stage numbers its runs from zero and
    // so does the daily rotation, so the same talent appearing in both produced
    // two attempts claiming one token. Keyed on the pair the schema already
    // guarantees unique, it cannot.
    jti: id('jti', attemptId.replace(/^sd_/, '')),
    xpAwarded: finished ? MINIGAME_XP_REWARD : null,
    xpSeenAt: finished && opts.xpSeen ? playedAt : null,
    // Both written by `rankMinigameFields`, once the field is known.
    rankXpAwarded: null,
    rankXpSeenAt: null,
  });

  if (!finished) return;

  world.grantXp({
    talent: opts.talent,
    source: 'minigame',
    sourceId: attemptId,
    amount: MINIGAME_XP_REWARD,
    at: playedAt,
  });
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
  const rewardId = id('xpr', rewardKey);
  const reward = world.buffer.xpReward.find((row) => row.id === rewardId);
  if (!reward) {
    throw new Error(
      `Récompense « ${rewardKey} » absente du catalogue : addXpRewards écrit XP_REWARDS, et grantReward ne peut attribuer que ce qui y figure.`,
    );
  }
  // Dated from the reward's own `awardedOn` rather than from a second copy of
  // the same offset: a grant that predates the handout it comes from is a row
  // the board could not have written, and two literals drift the first time one
  // of them moves.
  //
  // And a reward with NO date has not been handed out - that is the whole
  // meaning of the null `addXpRewards` places on one of them, and what the
  // board renders as « pas encore attribué ». So a grant against it is a
  // contradiction the dataset must not contain, and it is refused here rather
  // than left for a reader to notice.
  const awardedOn = reward.awardedOn as Date | null | undefined;
  if (!awardedOn) {
    throw new Error(
      `Récompense « ${rewardKey} » non encore attribuée (awardedOn null) : elle ne peut pas avoir été gagnée.`,
    );
  }
  world.grantXp({
    talent,
    source: 'reward',
    // The app keys a reward grant on `${rewardId}_${talentId}`; the same shape
    // here keeps the unique constraint on (source, sourceId) meaningful.
    sourceId: `${rewardId}_${talent.id}`,
    amount,
    at: awardedOn,
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
