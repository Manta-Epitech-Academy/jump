/**
 * The stage de seconde: one per campus, on one fortnight.
 *
 * It is not a big event, it is THE event. Production runs it on all fifteen
 * campuses over the same two weeks, and those fifteen rows carry 58% of the
 * presence table, 83% of the closings and 67% of the bilans of the whole
 * platform. A generator producing one of them, on one campus, describes a
 * platform where the cross-campus comparison - which is most of what the admin
 * API knows how to answer - has one campus to compare against fourteen empty
 * ones.
 *
 * **The instrumentation depth is placed, never drawn**, and the three tiers are
 * production's own. Eight campuses of fifteen actually used the platform during
 * the stage: émargement, planning, bilan, notes. The other seven used it for the
 * roster and for the closings they conducted anyway, and that second group
 * contains the BIGGEST stage of all (247 enrolments, no presence row) - so the
 * alternation below starts on `roster` at the heaviest campus rather than
 * rewarding size with depth.
 *
 *   - `flagship`  one campus, everything at once, and the 200-strong cohort
 *                 PROFILE.md records as the tail of the distribution. Ten
 *                 weekdays of émargement morning and afternoon is what puts the
 *                 presence table into the tens of thousands of rows, which is
 *                 where a query that looks fine on fifty rows stops being fine.
 *   - `instrumented`  inscrits, émargement, closings, bilan, diplôme.
 *   - `roster`  inscrits and closings only. No émargement, no bilan, no start
 *               time, no planning - and the closings still conducted, because
 *               that is what the seven campuses did.
 *
 * Cohort sizes follow the campus weight, which IS the real enrolment share, so
 * the campaign lands near production's 1 640 rather than on fifteen equal
 * cohorts. Only the flagship carries a floor, because it is the one whose size
 * is a requirement rather than an observation.
 */

import type { ClosingRecommendation } from '@prisma/client';
import { STAGE_PLANNING } from '../catalog/planning';
import { BANK_KEYS, RETIRED_QUESTION } from '../catalog/closings';
import { FEEDBACK_FORM_SLUGS } from '../catalog/feedbackForms';
import { STAGE_PUBLIC_NAME, stageTitre } from '../catalog/events';
import { EVENT_MODULES } from '../../../src/lib/domain/eventModules';
import { COHORT_NOUNS, eventDisplayName } from '../../../src/lib/domain/event';
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
import type { CampusRef, EventRef, StaffRef, TalentRef, World } from '../world';
import type { SeedProfileName } from '../context';

/**
 * Every verdict, in order, on the first four closings of the flagship. The rest
 * are drawn from the real mix. Leaving all of them to the dice means the rarest
 * verdict is missing whenever the cohort is small, which is exactly the case in
 * CI - so coverage would depend on the profile rather than on the generator.
 */
const VERDICT_COVER: readonly ClosingRecommendation[] = [
  'tres_compatible',
  'bon_profil',
  'indecis',
  'pas_interesse',
];

/**
 * When a cohort's dossiers were filed, as a window rather than a step.
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

type StageDepth = 'flagship' | 'instrumented' | 'roster';

/** Whether this depth ran the event inside Jump rather than only listing it. */
const isInstrumented = (depth: StageDepth) => depth !== 'roster';

/**
 * How many enrolments the whole campaign carries.
 *
 * A campaign total rather than a per-campus size, because that is the figure
 * PROFILE.md measures and the one a reader can check: the split between
 * campuses is then the weights' business, not a second number to keep in step.
 * `staging` carries production's own 1 640.
 *
 * A total map rather than a chain of `if`s, so a fifth profile fails the build
 * here instead of silently inheriting the biggest number in the file.
 */
const CAMPAIGN_SIZE: Readonly<Record<SeedProfileName, number>> = {
  ci: 40,
  demo: 180,
  dev: 400,
  staging: 1640,
};

/**
 * The flagship's floor: the tail cohort every list, export and aggregate is
 * actually judged at. The only size in this file that is a requirement rather
 * than an observation, which is why it is the only one allowed to override a
 * campus weight.
 */
const FLAGSHIP_FLOOR: Readonly<Record<SeedProfileName, number>> = {
  ci: 14,
  demo: 60,
  dev: 200,
  staging: 200,
};

type StagePlan = {
  readonly campus: CampusRef;
  readonly depth: StageDepth;
  readonly size: number;
  /** A grid named and not a single closing conducted: the configuration gap. */
  readonly conductsClosings: boolean;
  /** The roster pruned by a later sync, under its own bilan count. */
  readonly prunedRoster: boolean;
  readonly withPlanning: boolean;
};

type StageResult = {
  readonly event: EventRef;
  readonly cohort: readonly TalentRef[];
  readonly withDossier: readonly TalentRef[];
  readonly withoutDossier: readonly TalentRef[];
  readonly closings: number;
};

export const stage: Scenario = {
  // The flagship campus is reported by the manifest, not named here:
  // `pickCampus` falls back when the preferred one is outside the profile.
  // See `club.ts`.
  name: 'stage-seconde',
  summary:
    'Le stage de seconde sur chaque campus, même quinzaine : la grosse cohorte instrumentée, des campus qui émargent, des campus qui ne font que la liste.',
  run(world) {
    const { profile, clock } = world.ctx;
    const schoolYear = clock.schoolYear;

    const stageTemplateId = world.stageTemplateId;
    if (!stageTemplateId)
      throw new Error(
        'La grille de stage n’a pas été résolue avant les scénarios.',
      );

    // One window for the whole campaign, which is what makes it a campaign: the
    // fifteen stages of production share their dates to the day. Finished a
    // fortnight ago, so closings, the bilan and the certificate all have a
    // reason to exist. An event still running would have none of them.
    const days = world.eventWindow(-24, 10);

    const campuses = [...world.campuses.values()];
    const flagshipCampus = world.pickCampus('Lyon');
    const others = campuses.filter(
      (campus) => campus.name !== flagshipCampus.name,
    );

    const totalWeight = campuses.reduce((sum, c) => sum + c.weight, 0) || 1;
    const target = CAMPAIGN_SIZE[profile.name];
    const sizeFor = (campus: CampusRef) =>
      Math.max(1, Math.round((target * campus.weight) / totalWeight));

    const depths = others.map((_, index): StageDepth =>
      // Alternating from the heaviest campus and STARTING on `roster`: in
      // production the biggest stage of all is one nobody émargea, so a rule
      // that gave depth to size would invent a correlation the data does not
      // have.
      index % 2 === 0 ? 'roster' : 'instrumented',
    );

    // The two deliberately broken stages, placed by position rather than by
    // name so a profile with three campuses places them the way one with
    // fifteen does. Both are the last of their tier, which is its smallest
    // campus: a placed state belongs where it costs the least volume.
    const messy = profile.includeMessyStates;
    // A grid named and not one closing conducted. That gap is a figure of its
    // own: a coverage rate read over the whole périmètre once said 18% where it
    // should have said 78%, and what it was hiding was exactly this. It needs a
    // second roster campus beside it, or the tier is left with no example of
    // the normal case.
    const noClosingsAt =
      messy && depths.filter((depth) => depth === 'roster').length >= 2
        ? depths.lastIndexOf('roster')
        : -1;
    // A roster a later sync pruned under its own bilan count. `syncTalents`
    // deletes every participation the payload omits, which is why a closing, a
    // présence and a bilan are all decoupled from `Participation` - and why a
    // rate whose denominator is enrolments can legitimately exceed 100%.
    const prunedAt = messy ? depths.lastIndexOf('instrumented') : -1;
    // Production has six events carrying a planning, all formats together, and
    // all six are stages. One besides the flagship is the whole budget.
    const planningAt = depths.indexOf('instrumented');

    const plans: StagePlan[] = [
      {
        campus: flagshipCampus,
        depth: 'flagship',
        size: Math.max(FLAGSHIP_FLOOR[profile.name], sizeFor(flagshipCampus)),
        conductsClosings: true,
        prunedRoster: false,
        withPlanning: true,
      },
      ...others.map((campus, index): StagePlan => ({
        campus,
        depth: depths[index]!,
        size: sizeFor(campus),
        conductsClosings: index !== noClosingsAt,
        prunedRoster: index === prunedAt,
        withPlanning: index === planningAt,
      })),
    ];

    const results = plans.map((plan) =>
      addStageAt(world, { plan, days, schoolYear, stageTemplateId }),
    );

    // The public bilan answers, which match nobody. Once for the campaign
    // rather than once per campus: they carry no event, so fifteen copies would
    // be fifteen anonymous visitors of one stage answering as if there had been
    // fifteen forms.
    const flagship = results[0]!;
    for (
      let i = 0;
      i < Math.max(1, Math.round(flagship.cohort.length * 0.15));
      i += 1
    ) {
      addFeedbackSubmission(world, {
        formSlug: FEEDBACK_FORM_SLUGS[0]!,
        index: 1000 + i,
      });
    }

    const enrolled = results.reduce((sum, r) => sum + r.cohort.length, 0);
    const closings = results.reduce((sum, r) => sum + r.closings, 0);
    const emargement = results.filter((_, index) =>
      isInstrumented(plans[index]!.depth),
    ).length;

    world.ctx.manifest.push({
      scenario: stage.name,
      summary: stage.summary,
      campus: flagshipCampus.name,
      event: `${eventDisplayName(flagship.event)} · ${plans.length} campus`,
      covers: [
        `${plans.length} stages sur la même quinzaine, ${enrolled} inscrits au total, taille par poids de campus`,
        `${emargement} campus qui émargent et ${plans.length - emargement} qui ne font que la liste des inscrits`,
        `${flagship.cohort.length} inscrits sur ${flagshipCampus.name}, la cohorte la plus instrumentée du jeu de données`,
        `${days.length} jours d'émargement matin et après-midi, créneaux clôturés, dont un clôturé par l’horloge`,
        `${closings} closings dont un en cours et un portant une question retirée`,
        'un closing conduit par un membre depuis parti, et trois notes : autonome, éditée, sans auteur',
        'planning complet sur deux campus, six types de créneaux',
        'bilan avec des réponses publiques non appariées',
        'diplôme configuré, classement de fin de stage, minijeux dans les trois états',
        ...(profile.includeMessyStates
          ? [
              'un stage qui nomme une grille sans avoir conduit un seul closing',
              'un stage dont la liste d’inscrits a été élaguée sous son nombre de bilans',
            ]
          : []),
      ],
      // Reported, not asserted. Naming `cohort[0]` « dossier complet » was a
      // claim about a coin flip: the dossier loop skips one talent in eight, so
      // a different `--seed` made the manifest describe a dossier the dataset
      // did not contain - the one thing this page is built not to do.
      accounts: [
        flagship.withDossier[0] && {
          role: 'talent (dossier complet)',
          email: flagship.withDossier[0].email,
          note: 'code de connexion à usage unique',
        },
        flagship.withoutDossier[0] && {
          role: 'talent (inscription jamais commencée)',
          email: flagship.withoutDossier[0].email,
          note: 'code de connexion à usage unique',
        },
      ].filter((account) => account !== undefined),
    });
  },
};

/**
 * One campus's stage, at the depth its plan declares.
 *
 * Everything that differs between the three tiers is read off `plan` rather than
 * branched on the campus, so adding a tier is a line in the table above and not
 * a new `if` in the middle of the émargement loop.
 */
function addStageAt(
  world: World,
  opts: {
    plan: StagePlan;
    days: readonly Date[];
    schoolYear: string;
    stageTemplateId: string;
  },
): StageResult {
  const { rng } = world.ctx;
  const { plan, days, schoolYear, stageTemplateId } = opts;
  const { campus, depth, size } = plan;
  const team = world.staffFor(campus.id);
  const instrumented = isInstrumented(depth);
  const flagship = depth === 'flagship';

  const event = world.addEvent({
    key: 'stage-2nde',
    titre: stageTitre({ campus: campus.name, date: days[0]! }),
    publicName: STAGE_PUBLIC_NAME,
    cohortNoun: COHORT_NOUNS.STAGIAIRE,
    campus,
    days,
    // A roster-only stage was never opened on the day, so nobody typed the hour
    // it starts. Seven of production's fifteen carry none, and they are
    // activated all the same: the start time blocks nothing.
    startMinutes: instrumented ? 10 * 60 : null,
    devActivated: true,
    modules: instrumented
      ? [
          EVENT_MODULES.INSCRITS,
          EVENT_MODULES.EMARGEMENT,
          EVENT_MODULES.CLOSINGS,
          EVENT_MODULES.BILAN,
        ]
      : [EVENT_MODULES.INSCRITS, EVENT_MODULES.CLOSINGS],
    // The dossier funnel column on the Inscrits table - connexion, règlement,
    // droit à l'image. Opt-in per event, and in production it is on for 8 of
    // the 15 stages and for NOTHING else: a stage is the format where the
    // documents have to be chased, a Coding Club is an afternoon nobody signs
    // anything for. So it belongs here and not in `longTail`.
    //
    // It was `showParentContact`, a key the module's Zod schema does not
    // declare and therefore strips: the column has been silently off on the
    // one event whose whole point is that it should be on.
    moduleSettings: instrumented
      ? { [EVENT_MODULES.INSCRITS]: { showStatutColumn: true } }
      : undefined,
    closingTemplateId: stageTemplateId,
    feedbackFormId:
      world.feedbackForms.get(FEEDBACK_FORM_SLUGS[0] ?? '')?.id ?? null,
    diplomaTemplateId: instrumented ? world.diplomaTemplateId : null,
  });

  // The cohort's size and its instrumentation are the point of this event, so
  // no later scenario may pick it as « an event on this campus ».
  world.reserveEvent(event);

  if (plan.withPlanning) world.addPlanning(event, STAGE_PLANNING);

  const cohort = makeCohort(world, { size, campus, schoolYear });
  for (const talent of cohort) world.enrol(event, talent);

  // Dossiers. The flagship carries a dense cohort on purpose and the rest carry
  // production's own rate, and the split between the two is the point.
  //
  // In production 765 of the 1640 stage enrolments logged in at all (47%), and
  // 759 of those 765 finished (99%): the gate is the first login, not the
  // wizard. Applying 88% to fifteen campuses would put 1 443 dossiers on a
  // platform that holds 887. Applying 47% to all of them would leave the one
  // event whose whole point is that the documents get chased with half a cohort
  // to chase. So the flagship keeps the dense reading - the compliance column,
  // the relance audience and the parent portal are all read against it - and
  // every other campus carries the honest one.
  const dossierRate = flagship ? 0.88 : 0.47;
  const withDossier: TalentRef[] = [];
  const withoutDossier: TalentRef[] = [];
  for (const [index, talent] of cohort.entries()) {
    if (!rng.chance(dossierRate)) {
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
        Math.floor((index / size) * (FILING_WINDOW_END - FILING_WINDOW_START)),
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

  // Émargement, two cells a day for ten days. This is the volume, and it is
  // exactly what a roster-only campus does not have: seven of production's
  // fifteen stages hold not one presence row.
  if (instrumented) {
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
  }

  // Closings on nearly the whole cohort, plus one still in progress on the
  // flagship. A grid that is only ever seen finished hides the resume path.
  //
  // A quarter, which is what this was, is not production's ratio: the 14 stages
  // that carry closings run them on 42 to 100% of their roster, median 93, and
  // 1412 of the 1640 stage enrolments have one. A stage is two weeks with a 1:1
  // at the end of it - the team closes everybody they can - and it is the
  // non-stage events that sit at 70% and the ordinary event that has none at
  // all. Seeding a quarter here made « pas encore de closing » the majority
  // state on the one event where it is the exception, which is the wrong answer
  // for every screen that ranks, chases or exports them.
  //
  // Not 100%: the remainder is what the « closings restants » counter, the
  // coverage rate and the chase list are all read off.
  let closings = 0;
  if (plan.conductsClosings) {
    // At least one more than the verdicts being covered, so the in-progress
    // record has an index to sit on whatever the profile's cohort size is.
    const interviewed = rng.sample(
      cohort,
      flagship
        ? Math.max(VERDICT_COVER.length + 1, Math.round(size * 0.9))
        : Math.max(1, Math.round(size * 0.86)),
    );
    closings = interviewed.length;
    for (const [index, talent] of interviewed.entries()) {
      conductClosing(world, {
        talent,
        event,
        // One closing conducted by somebody who has since left. `staffId` is
        // `SetNull` so the closing survives the departure - it was cascading
        // once, and deleting an account destroyed every closing that person had
        // ever conducted. Without a null row the « Ancien membre » rendering
        // that replaced it has no example.
        staff:
          (flagship && index === 1) || team.length === 0
            ? null
            : rng.pick(team),
        templateId: stageTemplateId,
        questionKeys: STAGE_QUESTIONS,
        // One answered question that the grid no longer composes, so the
        // « Questions retirées » heading has something under it.
        retiredKeys: flagship && index === 0 ? [RETIRED_QUESTION.key] : [],
        status:
          flagship && index === VERDICT_COVER.length ? 'in_progress' : 'done',
        recommendation:
          flagship && index < VERDICT_COVER.length
            ? VERDICT_COVER[index]
            : undefined,
        conductedOffset: -12 + (index % 3),
      });
    }
  }

  // The bilan, on the campuses that opened the section. Three quarters of the
  // roster, which is production's median per stage: the seven stages whose
  // roster the sync left alone answer between 37 and 89% of it, median 78.
  if (instrumented) {
    const respondents = rng.sample(
      cohort,
      Math.max(2, Math.round(size * 0.75)),
    );
    for (const talent of respondents) {
      addFeedbackSubmission(world, {
        formSlug: FEEDBACK_FORM_SLUGS[0]!,
        talent,
        event,
      });
    }
  }

  // Notes, born from the émargement screen and carrying its slot. Production's
  // 197 event-bound notes are spread over the eight campuses that émargeaient,
  // which is the same thing said twice: the note is born from that screen. One
  // roster in five carries one, which is what those 197 are against the 942
  // enrolments of the eight.
  if (instrumented && team.length > 0) {
    for (const [index, talent] of rng
      .sample(cohort, Math.max(2, Math.round(size * 0.2)))
      .entries()) {
      addTalentNote(world, {
        talent,
        author: rng.pick(team),
        event,
        day: rng.pick(event.days),
        slot: rng.chance(0.5) ? 'morning' : 'afternoon',
        index,
      });
    }
  }

  if (flagship) addFlagshipExtras(world, { event, cohort, staff: team, size });

  // The roster a later sync pruned. Done last, so everything above was written
  // against the enrolment that existed at the time - which is the actual
  // sequence: the closing was conducted, the bilan was answered, and only then
  // did a truncated Salesforce payload take the participation away.
  if (plan.prunedRoster) {
    const kept = Math.max(1, Math.round(size * 0.25));
    for (const talent of cohort.slice(kept))
      world.pruneParticipation(event.id, talent.id);
  }

  return { event, cohort, withDossier, withoutDossier, closings };
}

/**
 * What only the flagship carries.
 *
 * Not a tier of its own: these are the shapes a screen needs ONE example of,
 * and fifteen copies of « une note dont l'auteur est parti » would be fifteen
 * copies of the same test. Volume is what the tiers above are for.
 */
function addFlagshipExtras(
  world: World,
  opts: {
    event: EventRef;
    cohort: readonly TalentRef[];
    staff: readonly StaffRef[];
    size: number;
  },
): void {
  const { rng } = world.ctx;
  const { event, cohort, staff, size } = opts;

  // The three other shapes the feed has to render, and that a note born from
  // émargement never produces: one written from the fiche with no event behind
  // it, one somebody has since edited, and one whose author has left the
  // company. That last one is the whole point of the `SetNull` on `authorId`:
  // the note outlives the account, and the screen prints `FORMER_STAFF_LABEL`
  // where the name was.
  if (staff[0] && cohort[0]) {
    addTalentNote(world, { talent: cohort[0], author: staff[0], index: 90 });
  }
  if (staff[0] && staff[1] && cohort[1]) {
    addTalentNote(world, {
      talent: cohort[1],
      author: staff[0],
      editedBy: staff[1],
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
      // The freshest win has not been celebrated yet and the rest have, which
      // is the state the one-shot float on the dashboard is gated on. It has to
      // straddle the ranking bonus too: the rank float is gated on its own
      // column, so a dataset where every ranked win is unseen leaves
      // `rankXpSeenAt` null everywhere and replays that celebration forever.
      xpSeen: index !== 0,
      // Both scoring families, so a leaderboard is never sorted on a column
      // that is null for everybody.
      scored: index % 3 === 0,
      index,
    });
  }
}
