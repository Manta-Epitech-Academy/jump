/**
 * The daily minigame, played.
 *
 * This is where the XP distribution comes from, and it is not the same thing as
 * attendance. Production's XP maximum is a talent with TWO events, 44 games and
 * 34 first places; the talents at the top of the attendance queue, the ones with
 * ten and eleven events, are all at zero XP and have never logged in. A
 * generator that hands XP out in proportion to how much somebody came produces a
 * leaderboard whose order nobody at Epitech would recognise.
 *
 * So the population is drawn on its own: 12.4% of talents have ever played (668
 * of 5 394), and among those the number of games follows a very long tail (157
 * played once, a couple played 44). The tail is the whole point. A flat handful
 * of games each gives every player about the same XP, which is the one shape
 * that makes a leaderboard, a tier and a reward threshold all look fine while
 * none of them has ever been exercised.
 *
 * The three attempt statuses are production's own ratio: 2 954 finished, 1 077
 * still pending, 450 invalid. A pending row is somebody who opened the game and
 * walked away, and it is what the play page's own loading and refusal states are
 * read off.
 *
 * Nothing here decides a RANK. `World.finalize` ranks every field once every
 * scenario has run - see `rankMinigameFields` - because a rank belongs to the
 * field and not to the run.
 */

import { addMinigameAttempt } from '../factories/engagement';
import type { Scenario } from './types';

/**
 * Share of talents who have ever played, from PROFILE.md: 668 of 5 394.
 *
 * It is applied to the talents this scenario can see, which are all of them: it
 * runs after every cohort has been built, which is also why it is a scenario
 * and not a few lines inside one.
 */
const PLAYER_SHARE = 0.124;

/**
 * How many games a player has played, as PROFILE.md measures it.
 *
 * The weights ARE the talent counts of the measured histogram, collapsed into
 * bands: 157 talents at one game, 125 at two, then a thinning tail out to 44.
 * Bands rather than every integer because the histogram past twenty is a
 * handful of talents per value, and a band of four values carrying their sum
 * reproduces the same shape without pretending the measurement was finer than
 * it was.
 */
const GAMES_PLAYED_MIX: readonly (readonly [
  readonly [number, number],
  number,
])[] = [
  [[1, 1], 157],
  [[2, 2], 125],
  [[3, 4], 96],
  [[5, 8], 99],
  [[9, 12], 76],
  [[13, 18], 59],
  [[19, 26], 31],
  [[27, 34], 11],
  [[35, 44], 4],
];

/**
 * Status of a run, from PROFILE.md's 2 954 / 1 077 / 450.
 *
 * `pending` and `invalid` are deliberately NOT rarities here. They are a third
 * of production's attempts, and the dashboard counts them differently from a
 * finished run, so a dataset that is 100% `done` makes both of those countings
 * look identical.
 */
const ATTEMPT_STATUS_MIX = [
  ['done', 2954],
  ['pending', 1077],
  ['invalid', 450],
] as const;

export const minigames: Scenario = {
  name: 'minijeux',
  summary:
    'Le jeu du jour, joué : une longue traîne de parties et l’écart d’XP qu’elle produit.',
  run(world) {
    const { rng } = world.ctx;
    const rotation = world.minigamePublications;
    if (rotation.length === 0) return;

    // Drawn rather than taken off the front of the list: `world.talents` is in
    // creation order, so the first slice of it is the stage de seconde's cohort
    // and nothing else, and the players would all have come from one campaign.
    const players = rng.sample(
      world.talents,
      Math.round(world.talents.length * PLAYER_SHARE),
    );

    let attempts = 0;
    let heaviest = 0;

    for (const talent of players) {
      // What the flagship stage already had them play during the event. The
      // pair is unique, so a publication they have is not one they can be
      // drawn onto again.
      const already = world.playedBy(talent.id);
      const available = rotation.filter(
        (publication) => !already.has(publication.id),
      );
      const [low, high] = rng.weighted(GAMES_PLAYED_MIX);
      // Capped by the calendar, not by the draw: a talent cannot play more
      // publications than there are. The cap only bites at a rotation shorter
      // than 44 days.
      const count = Math.min(rng.int(low, high), available.length);
      heaviest = Math.max(heaviest, count + already.size);

      // Distinct publications, spread over the window: a player with thirty of
      // the last thirty-nine days is somebody who came back nearly every day,
      // which is the behaviour the daily rotation is there to produce.
      for (const [index, publication] of rng
        .sample(available, count)
        .entries()) {
        addMinigameAttempt(world, {
          talent,
          publication,
          status: rng.weighted(ATTEMPT_STATUS_MIX),
          // The freshest run has not been celebrated yet and the rest have,
          // which is the state the one-shot float on the dashboard is gated on.
          // Per player rather than once overall: the float is per talent, so one
          // unseen row in the whole dataset leaves it untested for everybody
          // else.
          xpSeen: index !== 0,
        });
        attempts += 1;
      }
    }

    world.ctx.manifest.push({
      scenario: minigames.name,
      summary: minigames.summary,
      covers: [
        `${rotation.length} publications sur ${
          new Set(rotation.map((p) => p.publishedAt.getTime())).size
        } jours, plusieurs jeux le même jour`,
        `${players.length} joueurs sur ${world.talents.length} talents (12,4 % en production)`,
        `${attempts} parties, jusqu’à ${heaviest} pour un seul joueur`,
        'les trois états d’une partie : terminée, en attente, invalide',
        'des bonus de rang calculés sur le champ réel de chaque publication',
        'une publication d’un jeu retiré de la rotation depuis',
      ],
    });
  },
};
