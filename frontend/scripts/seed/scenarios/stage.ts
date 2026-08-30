/**
 * The stage de seconde: the big cohort, and the only place in the dataset where
 * every event surface is switched on at once.
 *
 * It carries the 200-strong cohort PROFILE.md records as the tail of the
 * distribution. That cohort is not the typical event and the generator does not
 * pretend otherwise - the median event has 23 enrolments - but it is the volume
 * every list, export and aggregate is actually judged at, so exactly one of them
 * exists per run.
 *
 * Ten weekdays of émargement, morning and afternoon, is what puts the presence
 * table into the tens of thousands of rows. That is the point: the émargement
 * screen and the attendance export are the two places where a query that looks
 * fine on fifty rows stops being fine.
 */

import type { ClosingRecommendation } from '@prisma/client';
import { STAGE_PLANNING } from '../catalog/planning';
import { BANK_KEYS, RETIRED_QUESTION } from '../catalog/closings';
import { FEEDBACK_FORM_SLUGS } from '../catalog/feedbackForms';
import { EVENT_MODULES } from '../../../src/lib/domain/eventModules';
import {
  WELCOME_XP_BONUS,
  onboardingEarlyBirdBonus,
} from '../../../src/lib/domain/xp';
import { addDossier } from '../factories/onboarding';
import { conductClosing } from '../factories/closing';
import { addFeedbackSubmission } from '../factories/communications';
import {
  addMinigameAttempt,
  addTalentNote,
  grantReward,
} from '../factories/engagement';
import { makeCohort, PRESENCE_MIX, PRESENCE_SOURCE_MIX } from './helpers';
import type { Scenario } from './types';

/**
 * Every verdict, in order, on the first four closings. The rest are drawn from
 * the real mix. Leaving all of them to the dice means the rarest verdict is
 * missing whenever the cohort is small, which is exactly the case in CI - so
 * coverage would depend on the profile rather than on the generator.
 */
const VERDICT_COVER: readonly ClosingRecommendation[] = [
  'tres_compatible',
  'bon_profil',
  'indecis',
  'pas_interesse',
];

const STAGE_QUESTIONS = [
  BANK_KEYS.discoveryChannel,
  BANK_KEYS.motivation,
  BANK_KEYS.specialties,
  BANK_KEYS.orientationTalk,
  BANK_KEYS.passionateTeacher,
  BANK_KEYS.techProjection,
  BANK_KEYS.otherJobs,
  BANK_KEYS.infoSources,
  BANK_KEYS.wantsMore,
  BANK_KEYS.satisfaction,
  BANK_KEYS.oneSentence,
  BANK_KEYS.nextYearEvents,
];

export const stage: Scenario = {
  name: 'stage-seconde-lyon',
  summary:
    'La grosse cohorte : 200 inscrits, deux semaines, émargement complet, closings, diplôme.',
  run(world) {
    const { profile, rng, clock } = world.ctx;
    const campus = world.campuses.has('Lyon')
      ? world.campus('Lyon')
      : [...world.campuses.values()][0]!;
    const team = world.staffFor(campus.id);
    const schoolYear = clock.schoolYear;

    const stageTemplateId = world.stageTemplateId;
    if (!stageTemplateId)
      throw new Error(
        'La grille de stage n’a pas été résolue avant les scénarios.',
      );

    const size =
      profile.name === 'ci' ? 14 : profile.name === 'demo' ? 60 : 200;
    const event = world.addEvent({
      key: 'stage-2nde',
      titre: `Stage de seconde ${campus.name} - ${schoolYear}`,
      publicName: `Stage de découverte ${campus.name}`,
      cohortNoun: 'stagiaires',
      campus,
      // Finished a fortnight ago, so closings, the bilan and the certificate all
      // have a reason to exist. An event still running would have none of them.
      startOffset: -24,
      weekdays: 10,
      startMinutes: 10 * 60,
      devActivated: true,
      modules: [
        EVENT_MODULES.INSCRITS,
        EVENT_MODULES.EMARGEMENT,
        EVENT_MODULES.CLOSINGS,
        EVENT_MODULES.BILAN,
      ],
      closingTemplateId: stageTemplateId,
      feedbackFormId:
        world.feedbackForms.get(FEEDBACK_FORM_SLUGS[0] ?? '')?.id ?? null,
      diplomaTemplateId: world.diplomaTemplateId,
    });

    world.addPlanning(event, STAGE_PLANNING);

    const cohort = makeCohort(world, { size, campus, schoolYear });
    for (const talent of cohort) world.enrol(event, talent);

    // Dossiers. 16% of the platform has one, but a stage cohort is the part that
    // does: these are the students who logged in, so most of them completed.
    for (const [index, talent] of cohort.entries()) {
      if (rng.chance(0.12)) continue;
      addDossier(world, {
        talent,
        schoolYear,
        stopAt: null,
        parentCoSigned: rng.chance(0.93),
        imageRights: rng.chance(0.13) ? 'refused' : 'accepted',
        filedOffset: -70 + index,
      });
      world.grantXp({
        talent,
        source: 'onboarding',
        sourceId: talent.id,
        amount: WELCOME_XP_BONUS,
      });
      const earlyBird = onboardingEarlyBirdBonus(index);
      if (earlyBird > 0) {
        world.grantXp({
          talent,
          source: 'onboarding_early_bird',
          sourceId: talent.id,
          amount: earlyBird,
        });
      }
    }

    // Émargement, two cells a day for ten days. This is the volume.
    for (const day of event.days) {
      for (const slot of ['morning', 'afternoon'] as const) {
        for (const talent of cohort) {
          world.markPresence({
            event,
            talent,
            day,
            slot,
            status: rng.weighted(PRESENCE_MIX),
            source: rng.weighted(PRESENCE_SOURCE_MIX),
            markedBy: team.length > 0 ? rng.pick(team) : null,
          });
        }
        world.closeSlot(event, day, slot, team[0] ?? null);
      }
    }

    // Closings on a quarter of the cohort, which is roughly production's ratio,
    // plus one still in progress. A grid that is only ever seen finished hides
    // the resume path entirely.
    // At least one more than the verdicts being covered, so the in-progress
    // record has an index to sit on whatever the profile's cohort size is.
    const interviewed = rng.sample(
      cohort,
      Math.max(VERDICT_COVER.length + 1, Math.round(size * 0.25)),
    );
    for (const [index, talent] of interviewed.entries()) {
      conductClosing(world, {
        talent,
        event,
        staff: team.length > 0 ? rng.pick(team) : null,
        templateId: stageTemplateId,
        questionKeys: STAGE_QUESTIONS,
        // One answered question that the grid no longer composes, so the
        // « Questions retirées » heading has something under it.
        retiredKeys: index === 0 ? [RETIRED_QUESTION.key] : [],
        status: index === VERDICT_COVER.length ? 'in_progress' : 'done',
        recommendation:
          index < VERDICT_COVER.length ? VERDICT_COVER[index] : undefined,
        conductedOffset: -12 + (index % 3),
      });
    }

    // The bilan. A third of the submissions are public and match nobody, which
    // is the shape of the one form in production that has answers at all.
    const respondents = rng.sample(cohort, Math.max(2, Math.round(size * 0.4)));
    for (const [index, talent] of respondents.entries()) {
      addFeedbackSubmission(world, {
        formSlug: FEEDBACK_FORM_SLUGS[0]!,
        index,
        talent,
        event,
      });
    }
    for (let i = 0; i < Math.max(1, Math.round(size * 0.15)); i += 1) {
      addFeedbackSubmission(world, {
        formSlug: FEEDBACK_FORM_SLUGS[0]!,
        index: 1000 + i,
      });
    }

    // Notes, born from the émargement screen and carrying its slot.
    for (const [index, talent] of rng
      .sample(cohort, Math.max(2, Math.round(size * 0.1)))
      .entries()) {
      if (team.length === 0) break;
      addTalentNote(world, {
        talent,
        author: rng.pick(team),
        event,
        day: rng.pick(event.days),
        slot: rng.chance(0.5) ? 'morning' : 'afternoon',
        index,
      });
    }

    // The end-of-stage scoreboard: the largest XP amounts in the dataset, which
    // is what makes a leaderboard look like production's rather than flat.
    for (const [rank, talent] of rng
      .sample(cohort, Math.min(12, size))
      .entries()) {
      grantReward(
        world,
        talent,
        'projet_stage_2nde',
        Math.max(200, 1800 - rank * 130),
      );
    }

    // Minigames, in all three attempt states.
    const publications = world.buffer.minigamePublication.map(
      (row) => row.id as string,
    );
    for (const [index, talent] of rng
      .sample(cohort, Math.min(20, size))
      .entries()) {
      const publicationId = publications[index % publications.length];
      if (!publicationId) break;
      addMinigameAttempt(world, {
        talent,
        publicationId,
        status:
          index % 7 === 0 ? 'pending' : index % 11 === 0 ? 'invalid' : 'done',
        rank: index + 1,
        fieldSize: Math.min(20, size),
        index,
      });
    }

    world.ctx.manifest.push({
      scenario: stage.name,
      summary: stage.summary,
      campus: campus.name,
      event: event.titre,
      covers: [
        `${size} inscrits, la cohorte la plus large du jeu de données`,
        `${event.days.length} jours d'émargement matin et après-midi, créneaux clôturés`,
        'planning complet, six types de créneaux',
        `${interviewed.length} closings dont un en cours et un portant une question retirée`,
        'bilan avec des réponses publiques non appariées',
        'diplôme configuré, classement de fin de stage, minijeux dans les trois états',
      ],
      accounts: cohort.slice(0, 2).map((talent, index) => ({
        role: index === 0 ? 'talent (dossier complet)' : 'talent',
        email: talent.email,
        note: 'code de connexion à usage unique',
      })),
    });
  },
};
