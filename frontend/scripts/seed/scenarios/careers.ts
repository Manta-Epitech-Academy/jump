/**
 * The three shapes at the top of the platform, placed.
 *
 * They are placed and not drawn for the reason `seed/CLAUDE.md` gives: at the
 * `ci` profile's couple of dozen talents, a tranche worth 0.04% of production
 * rounds to none, so a drawn tail makes coverage depend on the profile rather
 * than on the generator. What the volume scenarios produce is the BODY of the
 * distribution; this produces its end.
 *
 * And there are three of them rather than one « tryharder », because the dump
 * says they are three different people and flattening them into an average is
 * the mistake this file exists to avoid:
 *
 *   - **L'assidu.** Production's most-attended talents - the ones at ten and
 *     eleven events - are ALL at zero XP and have never logged in. They came,
 *     the team closed them, and they never opened the application. This is the
 *     shape that breaks « many events therefore engaged », and the one that
 *     proves a closing is a staff-side fact while XP is a talent-side one:
 *     seven closings, a high `eventsCount`, and an empty ledger.
 *   - **Le tryharder.** The intersection, and 1 talent in 5 394: a full season
 *     of events WITH their closings, a dossier, and a real minigame history. The
 *     profile the PO named (9 events, 4 953 XP, 18 games, 6 first places).
 *   - **Le joueur.** The XP maximum, and it is a two-event talent: 44 games out
 *     of the rotation and 34 first places. Its XP comes from coming back every
 *     day for the daily game, not from attendance, which is why the leaderboard
 *     is not a ranking of assiduity.
 *
 * It also places the one board the ordinary rotation cannot produce: a crowded
 * one, where the bonus pool opens past the podium.
 *
 * It runs last of the composing scenarios, after `minijeux`, and that order is a
 * dependency rather than a preference. A rank is computed from the field
 * (`World.rankMinigameFields`), so the only way to place a WIN is to place a
 * better result than everybody else's - which means the rest of the field has to
 * exist first. An ordinary run draws a standing under 0.9, so a placed 1.0 beats
 * every one of them; two placed 1.0 on one publication would only contest each
 * other, hence the disjoint slices below.
 */

import { WELCOME_XP_BONUS } from '../../../src/lib/domain/xp';
import {
  CLUB_TEMPLATE,
  CLUB_TEMPLATE_QUESTION_KEYS,
} from '../catalog/closings';
import { PRENOMS } from '../catalog/people';
import { conductClosing } from '../factories/closing';
import { addDossier } from '../factories/onboarding';
import {
  addMinigameAttempt,
  addTalentNote,
  grantReward,
} from '../factories/engagement';
import { id } from '../ids';
import { PRESENCE_MIX, PRESENCE_SOURCE_MIX } from './helpers';
import type { Scenario } from './types';
import type { EventRef, TalentRef, World } from '../world';

/** Publications the tryharder wins on, kept clear of the joueur's slice. */
const TRYHARDER_WINS = 6;
/** How many games the tryharder has played in all, wins included. */
const TRYHARDER_GAMES = 18;
/** The joueur's, which is production's own maximum. */
const JOUEUR_GAMES = 44;
const JOUEUR_WINS = 34;
/**
 * How many finishers the crowded board carries.
 *
 * Past thirty, `minigameRankBonusLimit` opens a fourth paying place - a tenth
 * of the field, floored at the podium - so this is what makes the flat
 * honourable-mention tier reachable at all. Forty-four also happens to be
 * production's heaviest single player, which is a coincidence and not a reason.
 */
const CROWDED_FIELD = 44;

/**
 * The past events of one campus that conduct closings, most recent first.
 *
 * The campus with the most of them is the club's, by construction: it is the
 * only recurring format in the dataset, so it is the only place a career of
 * nine can be spent. Found rather than named, so this scenario does not have to
 * know which campus `pickCampus` resolved to - it falls back when the preferred
 * one is outside the profile.
 */
function closingSeason(world: World): EventRef[] {
  const today = world.ctx.clock.today;
  const byCampus = new Map<string, EventRef[]>();
  for (const event of world.events) {
    if (event.closingTemplateId === null) continue;
    if (event.date >= today) continue;
    const season = byCampus.get(event.campusId);
    if (season) season.push(event);
    else byCampus.set(event.campusId, [event]);
  }
  let best: EventRef[] = [];
  for (const season of byCampus.values()) {
    if (season.length > best.length) best = season;
  }
  return [...best].sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * The campus holding the most talents, avoiding `exclude`.
 *
 * The crowded board needs forty-four people from ONE campus, since a board is
 * per campus; and it must not be the campus this scenario's three profiles sit
 * on, or their own placed wins would be contested by a field built to be
 * uniform.
 */
function mostPopulousCampus(world: World, exclude: string): string | null {
  const counts = new Map<string, number>();
  for (const talent of world.talents) {
    if (!talent.campusId || talent.campusId === exclude) continue;
    counts.set(talent.campusId, (counts.get(talent.campusId) ?? 0) + 1);
  }
  let best: string | null = null;
  let most = 0;
  for (const [campusId, count] of counts) {
    if (count > most) {
      most = count;
      best = campusId;
    }
  }
  return best;
}

export const careers: Scenario = {
  name: 'parcours',
  summary:
    'Les trois formes du sommet : l’assidu sans XP, le tryharder, et le joueur quotidien.',
  run(world) {
    const { rng, clock } = world.ctx;
    const season = closingSeason(world);
    if (season.length === 0) return;
    const campus = world.campus(season[0]!.campusName);
    const team = world.staffFor(campus.id);
    const clubTemplateId = id('clt', CLUB_TEMPLATE.key);
    const rotation = world.minigamePublications;

    const spawn = (nom: string, career: number): TalentRef =>
      world.addTalent({
        prenom: rng.pick(PRENOMS),
        nom,
        niveau: 'terminale',
        campus,
        index: world.nextTalentIndex(),
        career,
      });

    /** Enrols on `count` sessions and closes `share` of them, leaving gaps. */
    const walkTheSeason = (
      talent: TalentRef,
      count: number,
      share: number,
    ): { attended: EventRef[]; closed: EventRef[] } => {
      const attended = season.slice(0, Math.min(count, season.length));
      for (const event of attended) {
        world.enrol(event, talent);
        world.markPresence({
          event,
          talent,
          day: event.days[0]!,
          slot: 'afternoon',
          status: rng.weighted(PRESENCE_MIX),
          source: rng.weighted(PRESENCE_SOURCE_MIX),
          markedBy: team.length > 0 ? rng.pick(team) : null,
        });
      }
      // Seven in ten of the sessions they attended, drawn so the gaps land
      // somewhere a reader did not choose. This is the shape the PO asked for:
      // mostly closed, not always, and a parcours nobody would mistake for a
      // fixture.
      const closed = rng.sample(attended, Math.round(attended.length * share));
      for (const event of closed) {
        conductClosing(world, {
          talent,
          event,
          staff: team.length > 0 ? rng.pick(team) : null,
          templateId: event.closingTemplateId ?? clubTemplateId,
          questionKeys: CLUB_TEMPLATE_QUESTION_KEYS,
          conductedOffset:
            Math.round(
              (event.days[0]!.getTime() - clock.today.getTime()) / 86400000,
            ) + 1,
        });
      }
      return { attended, closed };
    };

    // ─── L'assidu ─────────────────────────────────────────────────────────────
    // Every session, closed on most of them, and nothing else at all: no
    // dossier, so `firstLoginAt` stays null and the ledger stays empty. That
    // combination is the whole point, and no volume scenario produces it - they
    // all hand a dossier to whoever they hand events to.
    const assidu = spawn('Assidu', season.length);
    const assiduWalk = walkTheSeason(assidu, season.length, 0.7);
    // A note from the émargement screen, because a talent the team sees every
    // three weeks is a talent they write about.
    if (team[0]) {
      addTalentNote(world, {
        talent: assidu,
        author: team[0],
        event: assiduWalk.attended[0]!,
        day: assiduWalk.attended[0]!.days[0]!,
        slot: 'afternoon',
        index: 80,
      });
    }

    // ─── Le tryharder ────────────────────────────────────────────────────────
    const tryharder = spawn('Tryharder', season.length);
    const tryharderWalk = walkTheSeason(tryharder, season.length - 1, 0.8);
    addDossier(world, {
      talent: tryharder,
      schoolYear: clock.schoolYear,
      stopAt: null,
      parentCoSigned: true,
      imageRights: 'accepted',
      filedOffset: -200,
    });
    world.grantXp({
      talent: tryharder,
      source: 'onboarding',
      sourceId: tryharder.id,
      amount: WELCOME_XP_BONUS,
      at: clock.days(-200),
    });
    // The boards a regular ends up on. `reward` is production's largest XP
    // source by a wide margin, and these two profiles are who shows why.
    //
    // Not `projet_stage_2nde`, although it is the catalogue's biggest: neither
    // of these two did a stage. They walk the club season, so the reward whose
    // name says « fin de stage » is not one they can have earned, and handing it
    // to them for the XP would be the dataset telling a story its own rows
    // contradict.
    grantReward(world, tryharder, 'ctf_shell_2026', 1400);
    grantReward(world, tryharder, 'presence_assidue', 300);
    grantReward(world, tryharder, 'quiz_culture_tech', 150);

    // ─── Le joueur ───────────────────────────────────────────────────────────
    // Two events, and the top of the leaderboard. Enrolled on the two most
    // recent sessions rather than the season, because the point is that his XP
    // owes nothing to attendance.
    const joueur = spawn('Joueur', 2);
    for (const event of season.slice(0, 2)) world.enrol(event, joueur);
    addDossier(world, {
      talent: joueur,
      schoolYear: clock.schoolYear,
      stopAt: null,
      parentCoSigned: true,
      imageRights: 'accepted',
      filedOffset: -150,
    });
    world.grantXp({
      talent: joueur,
      source: 'onboarding',
      sourceId: joueur.id,
      amount: WELCOME_XP_BONUS,
      at: clock.days(-150),
    });
    // First on the CTF, at production's own maximum grant of 1 800, plus the
    // two flat boards. The daily game and its ranking bonuses alone top out
    // near 5 800; production's maximum is a player who also won a competition,
    // which is what makes `reward` the largest source in the ledger.
    grantReward(world, joueur, 'ctf_shell_2026', 1800);
    grantReward(world, joueur, 'presence_assidue', 300);
    grantReward(world, joueur, 'quiz_culture_tech', 150);

    // ─── The board, placed top-down ──────────────────────────────────────────
    // Disjoint slices, so the two of them do not contest the same publication:
    // whoever lost would end up with a rank nobody placed and a win the manifest
    // claims they have.
    const tryharderSlice = rotation.slice(0, TRYHARDER_WINS);
    // One publication reserved for the crowded board below, kept out of both
    // profiles' pools so its shape is entirely placed.
    const crowded = rotation[TRYHARDER_WINS];
    const joueurPool = rotation.slice(TRYHARDER_WINS + 1);

    for (const [index, publication] of tryharderSlice.entries()) {
      addMinigameAttempt(world, {
        talent: tryharder,
        publication,
        status: 'done',
        // The best result the game reports, which is how you come first. A rank
        // is never passed: `rankMinigameFields` reads it off the field.
        standing: 1,
        xpSeen: index !== 0,
      });
    }
    // The rest of his history, played well but not won: an ordinary standing on
    // publications the joueur has taken the top of.
    for (const [index, publication] of rng
      .sample(joueurPool, Math.max(0, TRYHARDER_GAMES - tryharderSlice.length))
      .entries()) {
      addMinigameAttempt(world, {
        talent: tryharder,
        publication,
        status: 'done',
        standing: 0.3 + index * 0.02,
        xpSeen: true,
      });
    }

    const joueurRuns = joueurPool.slice(0, JOUEUR_GAMES);
    for (const [index, publication] of joueurRuns.entries()) {
      addMinigameAttempt(world, {
        talent: joueur,
        publication,
        // A player with 44 finished runs and not one abandoned one is a player
        // nobody has ever met, so two of his are left mid-game. Taken from the
        // runs he is NOT meant to win: an abandoned run finishes nowhere, so
        // putting one inside the winning slice quietly cost him a first place
        // and left the manifest claiming a number the board disagreed with.
        status: index >= JOUEUR_GAMES - 2 ? 'pending' : 'done',
        // First on the ones he is meant to win, merely good on the rest, so
        // « 34 premières places » is a fact about the board and not a label.
        standing: index < JOUEUR_WINS ? 1 : 0.5,
        xpSeen: index !== 0,
      });
    }

    // ─── A crowded board ─────────────────────────────────────────────────────
    // `minigameRankBonus` pays a flat 10 outside the podium, out to a tenth of
    // the field (`MINIGAME_RANK_BONUS_FRACTION`), and that tail only exists on a
    // board of more than thirty finishers: below it the limit floors at the
    // three podium slots. The ordinary rotation produces boards of three or
    // four, so the whole honourable-mention tier had no row - and the tier is
    // the reason the bonus pool is cohort-relative at all.
    //
    // Placed rather than drawn, in every detail, because a drawn board reaches
    // rank four only by luck: three excellent runs finish first, then a long
    // queue of steadily weaker ones, so every later finisher has exactly those
    // three ahead of it. It ranks fourth, and once the field passes thirty the
    // fourth place starts paying. One board therefore covers the full podium
    // AND its tail, at every profile.
    const crowdedCampus = mostPopulousCampus(world, campus.id);
    const crowdedField = world.talents
      .filter(
        (talent) =>
          talent.campusId === crowdedCampus &&
          !world.playedBy(talent.id).has(crowded?.id ?? ''),
      )
      .slice(0, CROWDED_FIELD);
    if (crowded && crowdedField.length >= 4) {
      for (const [index, talent] of crowdedField.entries()) {
        addMinigameAttempt(world, {
          talent,
          publication: crowded,
          status: 'done',
          // Three excellent runs first, in decreasing order, which takes the
          // podium: first of a field of one, second of two, third of three.
          //
          // Then a queue that IMPROVES, every entry better than the one before
          // and all of them below the podium. That is what pins each of them at
          // exactly rank four: the only runs ahead are those three, because
          // nobody who finished earlier in the queue was better. Decreasing
          // here instead - the obvious way round - puts everybody behind
          // everybody, so ranks run 4, 5, 6 … and the fourth place is held once,
          // on a field of four, where the limit still floors at three and pays
          // nothing.
          standing:
            index < 3
              ? 0.99 - index * 0.02
              : Math.min(0.9, 0.1 + index * 0.015),
          // Finish order, one minute apart, and the whole reason
          // `minuteOfDay` exists. Without it the order is a draw and the fourth
          // place lands wherever the dice put it.
          minuteOfDay: 8 * 60 + index,
          xpSeen: index !== 0,
        });
      }
    }

    world.ctx.manifest.push({
      scenario: careers.name,
      summary: careers.summary,
      campus: campus.name,
      covers: [
        `un assidu à ${assiduWalk.attended.length} événements et ${assiduWalk.closed.length} closings, 0 XP, jamais connecté`,
        `un tryharder à ${tryharderWalk.attended.length} événements, ${tryharderWalk.closed.length} closings, ${TRYHARDER_GAMES} parties et ${TRYHARDER_WINS} premières places`,
        `un joueur à 2 événements et ${joueurRuns.length} parties, premier ${JOUEUR_WINS} fois : le sommet du classement XP`,
        `un board bondé de ${crowdedField.length} finisseurs, seul endroit où le palier hors podium (10 XP) se paie`,
        'des closings sur sept séances sur dix, avec les trous entre elles',
        'trois récompenses de tableau sur un seul talent',
      ],
      accounts: [
        {
          role: 'talent (assidu sans XP)',
          email: assidu.email,
          note: 'vient à tout, closé presque partout, ne s’est jamais connecté',
        },
        {
          role: 'talent (tryharder)',
          email: tryharder.email,
          note: 'la saison, ses closings, un dossier complet et un historique de jeu',
        },
        {
          role: 'talent (joueur quotidien)',
          email: joueur.email,
          note: 'deux événements, le haut du classement XP',
        },
      ],
    });
  },
};
