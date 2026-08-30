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
import { BANK_KEYS, CLUB_TEMPLATE } from '../catalog/closings';
import { EVENT_MODULES } from '../../../src/lib/domain/eventModules';
import { conductClosing } from '../factories/closing';
import { addDossier } from '../factories/onboarding';
import { id } from '../ids';
import { makeCohort, PRESENCE_MIX, PRESENCE_SOURCE_MIX } from './helpers';
import type { Scenario } from './types';

const CLUB_QUESTIONS = [
  BANK_KEYS.discoveryChannel,
  BANK_KEYS.motivation,
  BANK_KEYS.techProjection,
  BANK_KEYS.otherJobs,
  BANK_KEYS.wantsMore,
  BANK_KEYS.satisfaction,
  BANK_KEYS.oneSentence,
];

export const club: Scenario = {
  name: 'coding-club-nice',
  summary:
    'Format court et récurrent : trois séances, la grille Coding Club, des habitués.',
  run(world) {
    const { profile, rng, clock } = world.ctx;
    const campus = world.campuses.has('Nice')
      ? world.campus('Nice')
      : [...world.campuses.values()][0]!;
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

    for (const [session, offset] of [-60, -30, 6].entries()) {
      const upcoming = offset > 0;
      const event = world.addEvent({
        key: `coding-club-${session + 1}`,
        titre: `Coding Club ${campus.name} - séance ${session + 1}`,
        publicName: `Coding Club ${campus.name}`,
        cohortNoun: 'participants',
        campus,
        startOffset: offset,
        weekdays: 1,
        startMinutes: 14 * 60,
        devActivated: true,
        modules: [
          EVENT_MODULES.INSCRITS,
          EVENT_MODULES.EMARGEMENT,
          EVENT_MODULES.CLOSINGS,
        ],
        closingTemplateId: clubTemplateId,
      });
      world.addPlanning(event, CODING_CLUB_PLANNING);

      const attending = rng.sample(
        regulars,
        rng.int(Math.ceil(size / 2), size),
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

      for (const talent of rng.sample(
        attending,
        Math.max(2, Math.round(attending.length * 0.4)),
      )) {
        conductClosing(world, {
          talent,
          event,
          staff: team.length > 0 ? rng.pick(team) : null,
          templateId: clubTemplateId,
          questionKeys: CLUB_QUESTIONS,
          conductedOffset: offset + 1,
        });
      }
    }

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
      event: `Coding Club ${campus.name}`,
      covers: [
        'trois séances dont une à venir, avec des inscrits qui reviennent',
        'la grille Coding Club, plus courte, avec deux libellés réécrits pour le format',
        'des questions de banque partagées avec le stage, donc comparables entre formats',
        'un talent avec plusieurs closings, ce que « Son parcours » affiche',
      ],
    });
  },
};
