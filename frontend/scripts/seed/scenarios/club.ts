/**
 * The Coding Club: a small, recurring, single-afternoon format.
 *
 * It exists to make the shared question bank mean something. « Comment as-tu
 * connu cet événement » asked at a stage and at a club is ONE bank row, which is
 * what lets a distribution span both formats; with a single format in the
 * dataset every cross-format figure reads as if it worked. The club grid also
 * reads two questions aloud in its own words, so a `labelOverride` that wrongly
 * changed identity instead of wording would show up as a split figure.
 */

import { CODING_CLUB_PLANNING } from '../catalog/planning';
import {
  CLUB_TEMPLATE,
  CLUB_TEMPLATE_QUESTION_KEYS,
} from '../catalog/closings';
import { codingClubPublicName, codingClubTitre } from '../catalog/events';
import { eventDisplayName } from '../../../src/lib/domain/event';
import { EVENT_MODULES } from '../../../src/lib/domain/eventModules';
import { conductClosing } from '../factories/closing';
import { addDossier } from '../factories/onboarding';
import { id } from '../ids';
import { withGuaranteed } from '../rng';
import { makeCohort, PRESENCE_MIX, PRESENCE_SOURCE_MIX } from './helpers';
import type { Scenario } from './types';
import type { EventRef } from '../world';

export const club: Scenario = {
  name: 'coding-club-nice',
  summary:
    'Format court et récurrent : trois séances, la grille Coding Club, des habitués.',
  run(world) {
    const { profile, rng, clock } = world.ctx;
    const campus = world.pickCampus('Nice');
    const team = world.staffFor(campus.id);
    const clubTemplateId = id('clt', CLUB_TEMPLATE.key);
    const size = profile.name === 'ci' ? 8 : 24;

    // The same students across three sessions. A regular attends eight to ten a
    // year, and the successive verdicts are what the talent fiche's history is
    // for - a dataset where nobody comes twice has no history to show.
    const regulars = makeCohort(world, {
      size,
      campus,
      schoolYear: clock.schoolYear,
    });

    // The first regular is guaranteed onto every session below, and onto the
    // first session's closed set - placed rather than drawn, because the
    // participation prune after the loop depends on it: it must land on
    // someone who is both closed on the first past session and enrolled on a
    // later one, and a random sample either produces that talent or it does
    // not.
    const anchorRegular = regulars[0]!;
    const sessionEvents: EventRef[] = [];

    for (const [session, offset] of [-60, -30, 6].entries()) {
      const upcoming = offset > 0;
      const days = world.eventWindow(offset, 1);
      const day = days[0]!;
      const event = world.addEvent({
        key: `coding-club-${session + 1}`,
        titre: codingClubTitre({ campus: campus.name, date: day }),
        publicName: codingClubPublicName(day),
        cohortNoun: 'participants',
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
      });
      sessionEvents.push(event);
      world.addPlanning(event, CODING_CLUB_PLANNING);

      const attending = withGuaranteed(
        rng.sample(regulars, rng.int(Math.ceil(size / 2), size)),
        anchorRegular,
      );
      for (const talent of attending) world.enrol(event, talent);

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
      // their roster. It also gives the regulars two and three closings each
      // rather than one, which is the history « Son parcours » is built to show.
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
      // The three sessions, read back off the rows that were written. Each one
      // now carries its own public name - the CRM dates every campaign and the
      // campus names it after the month or the camp it falls in - so a single
      // literal could not name all three, and quoting one would send the reader
      // looking for a session the switcher shows under two other names.
      event: sessionEvents.map(eventDisplayName).join(' · '),
      covers: [
        'trois séances dont une à venir, avec des inscrits qui reviennent',
        'la grille Coding Club, plus courte, avec deux libellés réécrits pour le format',
        'des questions de banque partagées avec le stage, donc comparables entre formats',
        'un talent avec plusieurs closings, ce que « Son parcours » affiche',
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
