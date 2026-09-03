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
import { STAGE_PUBLIC_NAME, stageTitre } from '../catalog/events';
import { EVENT_MODULES } from '../../../src/lib/domain/eventModules';
import { eventDisplayName } from '../../../src/lib/domain/event';
import {
  WELCOME_XP_BONUS,
  onboardingEarlyBirdBonus,
} from '../../../src/lib/domain/xp';
import { addDossier, DOSSIER_SPAN_DAYS } from '../factories/onboarding';
import { conductClosing } from '../factories/closing';
import { addFeedbackSubmission } from '../factories/communications';
import {
  addMinigameAttempt,
  addTalentNote,
  grantReward,
} from '../factories/engagement';
import { makeCohort, PRESENCE_MIX, PRESENCE_SOURCE_MIX } from './helpers';
import type { Scenario } from './types';
import type { TalentRef } from '../world';

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

/**
 * When the cohort's dossiers were filed, as a window rather than a step.
 *
 * They are filed in enrolment order, which is what makes the early-bird ranking
 * below mean anything, and the position inside the window is derived from the
 * cohort's SIZE. Deriving it from the index alone (`-70 + index`) is a date
 * computed from a count: it held at the fourteen-talent `ci` cohort the seed
 * check runs, and put 115 dossiers - with their signatures, their guardian
 * co-signatures and their rendered PDFs - after the anchor at the two profiles
 * anybody actually opens.
 *
 * The window closes `DOSSIER_SPAN_DAYS` before the anchor because a dossier
 * keeps writing after it is filed: the guardian's own two acts trail the
 * talent's by a week.
 */
const FILING_WINDOW_START = -70;
const FILING_WINDOW_END = -(DOSSIER_SPAN_DAYS + 1);

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
    const campus = world.pickCampus('Lyon');
    const team = world.staffFor(campus.id);
    const schoolYear = clock.schoolYear;

    const stageTemplateId = world.stageTemplateId;
    if (!stageTemplateId)
      throw new Error(
        'La grille de stage n’a pas été résolue avant les scénarios.',
      );

    const size =
      profile.name === 'ci' ? 14 : profile.name === 'demo' ? 60 : 200;
    // Finished a fortnight ago, so closings, the bilan and the certificate all
    // have a reason to exist. An event still running would have none of them.
    const days = world.eventWindow(-24, 10);
    const event = world.addEvent({
      key: 'stage-2nde',
      titre: stageTitre({ campus: campus.name, date: days[0]! }),
      publicName: STAGE_PUBLIC_NAME,
      cohortNoun: 'stagiaires',
      campus,
      days,
      startMinutes: 10 * 60,
      devActivated: true,
      modules: [
        EVENT_MODULES.INSCRITS,
        EVENT_MODULES.EMARGEMENT,
        EVENT_MODULES.CLOSINGS,
        EVENT_MODULES.BILAN,
      ],
      // The dossier funnel column on the Inscrits table - connexion, règlement,
      // droit à l'image. Opt-in per event, and in production it is on for 8 of
      // the 15 stages and for NOTHING else: a stage is the format where the
      // documents have to be chased, a Coding Club is an afternoon nobody signs
      // anything for. So it belongs here and not in `longTail`.
      //
      // It was `showParentContact`, a key the module's Zod schema does not
      // declare and therefore strips: the column has been silently off on the
      // one event whose whole point is that it should be on.
      moduleSettings: {
        [EVENT_MODULES.INSCRITS]: { showStatutColumn: true },
      },
      closingTemplateId: stageTemplateId,
      feedbackFormId:
        world.feedbackForms.get(FEEDBACK_FORM_SLUGS[0] ?? '')?.id ?? null,
      diplomaTemplateId: world.diplomaTemplateId,
    });

    world.addPlanning(event, STAGE_PLANNING);

    const cohort = makeCohort(world, { size, campus, schoolYear });
    for (const talent of cohort) world.enrol(event, talent);

    // Dossiers. 16% of the platform has one, and a stage cohort is the part
    // that does - but this is a DELIBERATE departure from PROFILE.md and it is
    // worth being exact about which half. In production 765 of the 1640 stage
    // enrolments logged in at all (47%), and 759 of those 765 finished (99%):
    // the gate is the first login, not the wizard. So the wizard's completion
    // rate is reproduced faithfully and its login rate is not, because a stage
    // is the one event where the règlement and the droit à l'image have to be
    // chased, and half a cohort with no dossier at all leaves the compliance
    // column, the relance audience and the parent portal reading against a
    // handful of rows. The platform-wide 16% is carried by `longTail`, which is
    // where the honest figure belongs.
    const withDossier: TalentRef[] = [];
    const withoutDossier: TalentRef[] = [];
    for (const [index, talent] of cohort.entries()) {
      if (rng.chance(0.12)) {
        withoutDossier.push(talent);
        continue;
      }
      withDossier.push(talent);
      addDossier(world, {
        talent,
        schoolYear,
        stopAt: null,
        parentCoSigned: rng.chance(0.93),
        imageRights: rng.chance(0.13) ? 'refused' : 'accepted',
        filedOffset:
          FILING_WINDOW_START +
          Math.floor(
            (index / size) * (FILING_WINDOW_END - FILING_WINDOW_START),
          ),
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
        // The first half-day is closed by the clock rather than by anybody:
        // `closedById` is nullable FOR that case, and a dataset where a member
        // closed every slot never renders « clôturé automatiquement ».
        const closedByClock = day === event.days[0] && slot === 'morning';
        world.closeSlot(
          event,
          day,
          slot,
          closedByClock ? null : (team[0] ?? null),
        );
      }
    }

    // Closings on nearly the whole cohort, plus one still in progress. A grid
    // that is only ever seen finished hides the resume path entirely.
    //
    // A quarter, which is what this was, is not production's ratio: the 14
    // stages that carry closings run them on 42 to 100% of their roster, median
    // 93, and 1412 of the 1640 stage enrolments have one. A stage is two weeks
    // with a 1:1 at the end of it - the team closes everybody they can - and
    // it is the non-stage events that sit at 70% and the ordinary event that
    // has none at all. Seeding a quarter here made « pas encore de closing »
    // the majority state on the one event where it is the exception, which is
    // the wrong answer for every screen that ranks, chases or exports them.
    //
    // Not 100%: the remainder is what the « closings restants » counter, the
    // coverage rate and the chase list are all read off.
    // At least one more than the verdicts being covered, so the in-progress
    // record has an index to sit on whatever the profile's cohort size is.
    const interviewed = rng.sample(
      cohort,
      Math.max(VERDICT_COVER.length + 1, Math.round(size * 0.9)),
    );
    for (const [index, talent] of interviewed.entries()) {
      conductClosing(world, {
        talent,
        event,
        // One closing conducted by somebody who has since left. `staffId` is
        // `SetNull` so the closing survives the departure - it was cascading
        // once, and deleting an account destroyed every closing that person had
        // ever conducted. Without a null row the « Ancien membre » rendering
        // that replaced it has no example.
        staff: index === 1 || team.length === 0 ? null : rng.pick(team),
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

    // The three other shapes the feed has to render, and that a note born from
    // émargement never produces: one written from the fiche with no event
    // behind it, one somebody has since edited, and one whose author has left
    // the company. That last one is the whole point of the `SetNull` on
    // `authorId`: the note outlives the account, and the screen prints
    // `FORMER_STAFF_LABEL` where the name was.
    if (team[0] && cohort[0]) {
      addTalentNote(world, { talent: cohort[0], author: team[0], index: 90 });
    }
    if (team[0] && team[1] && cohort[1]) {
      addTalentNote(world, {
        talent: cohort[1],
        author: team[0],
        editedBy: team[1],
        event,
        day: event.days[0]!,
        slot: 'morning',
        index: 91,
      });
    }
    if (cohort[2]) {
      addTalentNote(world, { talent: cohort[2], author: null, index: 92 });
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
        // Half the runs happened during the stage, half from home, and both
        // states carry meaning: `eventId` is what attributes a run to an event.
        event: index % 2 === 0 ? event : undefined,
        // The freshest win has not been celebrated yet and the rest have,
        // which is the state the one-shot float on the dashboard is gated on.
        // It has to straddle the ranking bonus too: the rank float is gated on
        // its own column, so a dataset where every ranked win is unseen leaves
        // `rankXpSeenAt` null everywhere and replays that celebration forever.
        xpSeen: index !== 0,
        // Both scoring families, so a leaderboard is never sorted on a column
        // that is null for everybody.
        scored: index % 3 === 0,
        index,
      });
    }

    world.ctx.manifest.push({
      scenario: stage.name,
      summary: stage.summary,
      campus: campus.name,
      event: eventDisplayName(event),
      covers: [
        'un closing conduit par un membre depuis parti, et trois notes : autonome, éditée, sans auteur',
        'un créneau d’émargement clôturé par l’horloge et non par quelqu’un',
        `${size} inscrits, la cohorte la plus large du jeu de données`,
        `${event.days.length} jours d'émargement matin et après-midi, créneaux clôturés`,
        'planning complet, six types de créneaux',
        `${interviewed.length} closings dont un en cours et un portant une question retirée`,
        'bilan avec des réponses publiques non appariées',
        'diplôme configuré, classement de fin de stage, minijeux dans les trois états',
      ],
      // Reported, not asserted. Naming `cohort[0]` « dossier complet » was a
      // claim about a coin flip: the dossier loop skips one talent in eight, so
      // a different `--seed` made the manifest describe a dossier the dataset
      // did not contain - the one thing this page is built not to do.
      accounts: [
        withDossier[0] && {
          role: 'talent (dossier complet)',
          email: withDossier[0].email,
          note: 'code de connexion à usage unique',
        },
        withoutDossier[0] && {
          role: 'talent (inscription jamais commencée)',
          email: withoutDossier[0].email,
          note: 'code de connexion à usage unique',
        },
      ].filter((account) => account !== undefined),
    });
  },
};
