/**
 * The Coding Club: a small, recurring, single-afternoon format, run as a season.
 *
 * It exists to make the shared question bank mean something. « Comment as-tu
 * connu cet événement » asked at a stage and at a club is ONE bank row, which is
 * what lets a distribution span both formats; with a single format in the
 * dataset every cross-format figure reads as if it worked. The club grid also
 * reads two questions aloud in its own words, so a `labelOverride` that wrongly
 * changed identity instead of wording would show up as a split figure.
 *
 * It is also the only format in the dataset that can produce an ATTENDANCE
 * TAIL, and that is the second reason it exists. Production's most-attended
 * talents sit at nine, ten and eleven events, and they got there by going to a
 * recurring format all year: a stage is one fortnight and cannot be attended
 * twice. See `SESSION_OFFSETS` for why the length of the season is a calendar
 * rather than something a profile scales.
 */

import { CODING_CLUB_PLANNING } from '../catalog/planning';
import {
  CLUB_TEMPLATE,
  CLUB_TEMPLATE_QUESTION_KEYS,
} from '../catalog/closings';
import { codingClubPublicName, codingClubTitre } from '../catalog/events';
import { WORKSHOPS } from '../catalog/workshops';
import { COHORT_NOUNS, eventDisplayName } from '../../../src/lib/domain/event';
import { EVENT_MODULES } from '../../../src/lib/domain/eventModules';
import { conductClosing } from '../factories/closing';
import { addDossier } from '../factories/onboarding';
import { id } from '../ids';
import { withGuaranteed } from '../rng';
import { makeCohort, PRESENCE_MIX, PRESENCE_SOURCE_MIX } from './helpers';
import type { Scenario } from './types';
import type { EventRef } from '../world';

/**
 * The season, as days before the anchor. Nine sessions already run, every three
 * weeks, and one still to come.
 *
 * **A calendar, not a volume**, so no profile scales it. That is the point:
 * this is the only format in the dataset that can produce an attendance tail,
 * and production's most-attended talents sit at nine, ten and eleven events
 * because they went to a recurring one all year. A season whose length followed
 * the profile would put the whole tail out of reach in CI, which is exactly what
 * `seed/CLAUDE.md` means by a rare state depending on the profile rather than on
 * the generator. What scales is how many people come to each session, not how
 * many sessions there were.
 *
 * Three sessions was the old shape, and three is not a short season: it is a
 * different thing. It capped every parcours in the dataset at three events and
 * two or three closings, on one campus, which is the hole this change exists to
 * fill.
 */
const SESSION_OFFSETS = [
  -189, -168, -147, -126, -105, -84, -63, -42, -21, 6,
] as const;

const [PACMAN, LINUX] = WORKSHOPS;

/**
 * Which online activities a session offers.
 *
 * Two sessions of the ten, and that is the real distribution rather than a
 * sample: most events offer none at all, so the empty case is what a dashboard
 * and an export mostly render. The two that do offer one carry the SAME subject
 * at DIFFERENT durations, which is the whole reason `durationMinutes` sits on the
 * link and not on the catalogue, and the retired instance is attached beside it
 * with a wording of its own, so an event reading a question aloud in its own
 * words exists next to one that does not.
 */
function activitiesFor(session: number, upcoming: boolean) {
  if (upcoming) return [{ slug: PACMAN!.slug, durationMinutes: 150 }];
  if (session !== SESSION_OFFSETS.length - 2) return [];
  return [
    { slug: PACMAN!.slug, durationMinutes: PACMAN!.durationMinutes },
    {
      slug: LINUX!.slug,
      durationMinutes: LINUX!.durationMinutes,
      labelOverride: 'Découverte de la ligne de commande',
    },
  ];
}

export const club: Scenario = {
  // Not `coding-club-nice`: `pickCampus` falls back when the preferred campus
  // is outside the profile, and at every profile under nine campuses this runs
  // on Paris - so the name contradicted the « Campus : » line the manifest
  // prints from the row that was actually written. The campus is reported, never
  // named here.
  name: 'coding-club',
  summary:
    'Format court et récurrent : une saison de séances, la grille Coding Club, des habitués.',
  run(world) {
    const { profile, rng, clock } = world.ctx;
    const campus = world.pickCampus('Nice');
    const team = world.staffFor(campus.id);
    const clubTemplateId = id('clt', CLUB_TEMPLATE.key);
    const size = profile.name === 'ci' ? 8 : 24;

    // The same students across a whole season. A regular attends eight to ten
    // sessions a year, and the successive verdicts are what the talent fiche's
    // history is for - a dataset where nobody comes twice has no history to
    // show.
    //
    // Their career is PLACED at the length of the season rather than drawn,
    // because this format IS the tail of `CAREER_MIX` rather than a sample of
    // it: coming back is the definition of a regular, and drawing a career of
    // one for them and then enrolling them ten times would make that cap a
    // decoration. A third are recruited from whoever the stage already brought
    // in on this campus, which is what makes a club closing sit in the same
    // parcours as a stage closing instead of beside it.
    //
    // The placement covers the recruits too, and has to. It used to cover only
    // the talents this call minted, and the recruits were asked for ten events
    // of headroom instead - a career of eleven, which `CAREER_MIX` draws for
    // 0.04% of talents, so the pool was empty on all but a few per cent of runs
    // and the third was always zero. The stage/club parcours this scenario
    // claims to build did not exist in any generated dataset.
    const regulars = makeCohort(world, {
      size,
      campus,
      schoolYear: clock.schoolYear,
      career: SESSION_OFFSETS.length,
      returning: { share: 1 / 3 },
    });

    // The first regular is guaranteed onto every session below, and onto the
    // first session's closed set - placed rather than drawn, because the
    // participation prune after the loop depends on it: it must land on
    // someone who is both closed on the first past session and enrolled on a
    // later one, and a random sample either produces that talent or it does
    // not.
    const anchorRegular = regulars[0]!;
    const sessionEvents: EventRef[] = [];

    for (const [session, offset] of SESSION_OFFSETS.entries()) {
      const upcoming = offset > 0;
      const days = world.eventWindow(offset, 1);
      const day = days[0]!;
      const event = world.addEvent({
        key: `coding-club-${session + 1}`,
        titre: codingClubTitre({ campus: campus.name, date: day }),
        publicName: codingClubPublicName(day),
        cohortNoun: COHORT_NOUNS.PARTICIPANT,
        campus,
        days,
        startMinutes: 14 * 60,
        devActivated: true,
        modules: [
          EVENT_MODULES.INSCRITS,
          EVENT_MODULES.EMARGEMENT,
          EVENT_MODULES.CLOSINGS,
        ],
        closingTemplateId: clubTemplateId,
        workshops: activitiesFor(session, upcoming),
      });
      sessionEvents.push(event);
      // Two sessions of the season carry a planning, not all ten. Production
      // has SIX events with a planning across the whole platform, all of them
      // stages, so a club that published one every three weeks would be the
      // dominant planning in the dataset. The upcoming session, which is the one
      // a planning is actually for, and the most recent past one, so a filled
      // grid exists next to an empty one.
      if (upcoming || session === SESSION_OFFSETS.length - 2) {
        world.addPlanning(event, CODING_CLUB_PLANNING);
      }
      // Placed like the stage's: the regulars, the pruned enrolment and the
      // future session are all this scenario's own composition.
      world.reserveEvent(event);

      // Three quarters of the roster, drawn per session. That draw is what puts
      // the HOLES in a parcours: over ten sessions a regular lands on seven or
      // eight of them, never a clean ten for ten, which is what a history
      // screen and a coverage rate actually have to render.
      const attending = withGuaranteed(
        rng.sample(regulars, rng.int(Math.ceil(size * 0.55), size)),
        anchorRegular,
      );
      for (const talent of attending) world.enrol(event, talent);

      // Three states of an activity, placed rather than drawn, because each one
      // renders a different thing and a draw either produces them or does not:
      // nobody has entered the retired one, one regular is owed a celebration
      // (the XP arrived while the Jump tab was in the background, which is the
      // demo), and another has already seen theirs.
      if (!upcoming && activitiesFor(session, upcoming).length > 0) {
        const other = attending.find((t) => t.id !== anchorRegular.id);
        world.enterWorkshop({
          talent: anchorRegular,
          event,
          slug: PACMAN!.slug,
          budgetMinutes: PACMAN!.durationMinutes,
          solvedSteps: 6,
          totalSteps: PACMAN!.totalSteps,
          at: clock.days(-2),
          celebrated: false,
        });
        if (other) {
          world.enterWorkshop({
            talent: other,
            event,
            slug: PACMAN!.slug,
            budgetMinutes: PACMAN!.durationMinutes,
            solvedSteps: PACMAN!.totalSteps,
            totalSteps: PACMAN!.totalSteps,
            at: day,
            celebrated: true,
          });
        }
      }

      if (upcoming) continue;

      for (const slot of ['afternoon'] as const) {
        for (const talent of attending) {
          world.markPresence({
            event,
            talent,
            day: event.days[0]!,
            slot,
            status: rng.weighted(PRESENCE_MIX),
            source: rng.weighted(PRESENCE_SOURCE_MIX),
            markedBy: team.length > 0 ? rng.pick(team) : null,
          });
        }
      }

      // Seven in ten, which is what the non-stage events that run closings
      // actually do: production's eleven of them sit between 68% and 79% of
      // their roster. Over a season it is also what gives a regular five or six
      // closings with gaps between them, which is the history « Son parcours »
      // is built to show and the shape the PO asked for: mostly closed, not
      // always.
      const closed = rng.sample(
        attending,
        Math.max(2, Math.round(attending.length * 0.7)),
      );
      for (const talent of session === 0
        ? withGuaranteed(closed, anchorRegular)
        : closed) {
        conductClosing(world, {
          talent,
          event,
          staff: team.length > 0 ? rng.pick(team) : null,
          templateId: clubTemplateId,
          questionKeys: CLUB_TEMPLATE_QUESTION_KEYS,
          conductedOffset: offset + 1,
        });
      }
    }

    // Simulate the exact state PR #284 protects: a closing surviving a
    // participation the Salesforce sync has since pruned. `anchorRegular` is
    // guaranteed above to be closed on the first past session and enrolled on
    // both later ones, so pruning only the first session's participation
    // leaves them reachable through scoped access via the others, and their
    // closing standing with no participation behind it.
    world.pruneParticipation(sessionEvents[0]!.id, anchorRegular.id);

    // A handful of club regulars have a dossier too, so the fiche shows a
    // student who is both enrolled everywhere and fully in order.
    for (const talent of rng.sample(
      regulars,
      Math.max(2, Math.round(size * 0.3)),
    )) {
      // The third recruited from the stage arrive with theirs already filed: a
      // dossier is annual, not per format.
      if (world.hasDossier(talent.id, clock.schoolYear)) continue;
      addDossier(world, {
        talent,
        schoolYear: clock.schoolYear,
        stopAt: null,
        imageRights: 'accepted',
      });
    }

    world.ctx.manifest.push({
      scenario: club.name,
      summary: club.summary,
      campus: campus.name,
      // The season's ends, read back off the rows that were written. Each
      // session carries its own public name - the CRM dates every campaign and
      // the campus names it after the month or the camp it falls in - so a
      // single literal could not name any of them, and listing all ten would
      // fill the page a reader is trying to scan.
      event: `${eventDisplayName(sessionEvents[0]!)} … ${eventDisplayName(
        sessionEvents[sessionEvents.length - 1]!,
      )}`,
      covers: [
        `une saison de ${SESSION_OFFSETS.length} séances toutes les trois semaines, dont une à venir`,
        'des habitués qui viennent à sept ou huit d’entre elles, pas à toutes',
        'la grille Coding Club, plus courte, avec deux libellés réécrits pour le format',
        'des questions de banque partagées avec le stage, donc comparables entre formats',
        'des talents avec cinq ou six closings et des trous entre eux, ce que « Son parcours » affiche',
        'un closing qui survit à la suppression de sa participation par le worker Salesforce',
      ],
      accounts: [
        {
          role: 'talent (closing sans participation)',
          email: anchorRegular.email,
          note: 'la participation de la première séance a été supprimée après coup ; le closing tient toujours',
        },
      ],
    });
  },
};
