/**
 * The long tail, which is most of the platform.
 *
 * 235 of production's 292 events carry no module at all, 41 have no enrolment,
 * 219 have no public name, and the median event has 23 people on it. A dataset
 * made only of well-configured, well-attended events describes a platform nobody
 * works on, and it hides the states that are actually most common: the empty
 * list, the event that is only a Salesforce row, the screen with nothing to show
 * yet.
 *
 * It also puts one event in each lifecycle branch. `getEventStatus` has three,
 * and two of them are unreachable if every event is in the past.
 */

import { EVENT_MODULES } from '../../../src/lib/domain/eventModules';
import { COHORT_NOUNS } from '../../../src/lib/domain/event';
import { WELCOME_XP_BONUS } from '../../../src/lib/domain/xp';
import { addDossier } from '../factories/onboarding';
import {
  CLUB_TEMPLATE,
  CLUB_TEMPLATE_QUESTION_KEYS,
} from '../catalog/closings';
import { conductClosing } from '../factories/closing';
import {
  CLUB_THEMES,
  campLabel,
  codingClubPublicName,
  codingClubTitre,
} from '../catalog/events';
import { id } from '../ids';
import {
  makeCohort,
  cohortSize,
  PRESENCE_MIX,
  PRESENCE_SOURCE_MIX,
} from './helpers';
import type { Scenario } from './types';

export const longTail: Scenario = {
  name: 'longue-traine',
  summary:
    'Les événements ordinaires : non configurés, sans inscrit, à venir, en cours, passés.',
  run(world) {
    const { profile, rng, clock } = world.ctx;
    const campuses = [...world.campuses.values()];
    const schoolYear = clock.schoolYear;
    const scale =
      profile.name === 'staging' ? 1 : profile.name === 'ci' ? 0.08 : 0.25;
    const target = Math.max(6, Math.round(profile.events * 0.7));
    const clubTemplateId = id('clt', CLUB_TEMPLATE.key);

    let created = 0;
    let empty = 0;
    let unconfigured = 0;

    for (let index = 0; index < target; index += 1) {
      // One guaranteed per campus first (index < campuses.length visits each
      // exactly once), then the rest by real weight: PROFILE.md's own skew,
      // which is what gives a cross-campus comparison something to compare.
      const campus =
        index < campuses.length ? campuses[index]! : world.pickWeightedCampus();
      const team = world.staffFor(campus.id);

      // 14% of events have nobody on them, and 80% were never configured. Both
      // are the ordinary case, not a defect to seed around.
      const noEnrolment = index % 7 === 0;
      const configured = index % 5 === 0;

      // The one event standing between « à configurer » and « visible »:
      // sections enabled, a public name typed, and no end date yet - so
      // `eventConfigState` reads « prêt à publier » while
      // `activationBlockerKeys` still refuses the toggle. That gap is the whole
      // reason those are two separate rules, and it had no example: every
      // configured event here was activated in the same breath, which is also
      // how a fifth of the dataset ended up ACTIVATED with no end date, a state
      // the configuration screen would have refused. Index 0 because it is the
      // upcoming one, which is when a human is actually mid-preparation, and
      // because it is the only `configured` index the smallest profile reaches
      // besides index 5 - and index 5 has to stay visible for the school-year
      // switcher.
      const beingPrepared = index === 0;

      // Half the configured ones also run closings, which is roughly the share
      // production shows: the module is on for 33 events out of 292, and 25
      // events actually carry a record. It matters that some of them are
      // ordinary events rather than only the two flagship scenarios - a closing
      // distribution, a per-campus coverage rate and the « à closer » list all
      // read across the whole périmètre, and with closings living on one stage
      // and one club every one of those figures was a single campus wearing a
      // platform's clothes.
      const runsClosings = configured && !beingPrepared && index % 10 === 5;

      // One of each lifecycle branch, then a spread across the school year.
      // Index 5 (the first naturally `configured` index past the fixed
      // lifecycle ones) is placed at the far end of that spread rather than
      // drawn, because the school-year switcher needs at least one NAVIGABLE
      // event to land in the PRECEDING year and a random draw either crosses
      // the cutover or it does not - see the anchor's own comment in
      // check-seed-profiles.sh for why -300 is far enough. An unconfigured
      // event carries no module, so it is never navigable and could not do
      // this job even placed correctly, which is why index 3 (unconfigured)
      // is not the one used here.
      const offset =
        index === 0
          ? 3
          : index === 1
            ? 0
            : index === 2
              ? -1
              : index === 5
                ? -300
                : -rng.int(5, 300);

      // A handful run over two days. Production's short formats are a single
      // day or that day plus the next - only the stages run longer - and a
      // multi-day event is the only thing that makes the émargement day picker
      // do anything.
      //
      // Those carry an end date whether or not anybody configured them, which
      // is not an oversight: the end date IS the second day, so an event
      // running two of them cannot be expressed without one. It leaves a few
      // events holding a date and nothing else - somebody opened the
      // configuration screen, typed the window, and never enabled a section -
      // which is the one shape that gives `endDate` a row where `publicName`
      // is still null.
      //
      // Which is also why `beingPrepared` is excluded rather than left to the
      // arithmetic: index 0 satisfies `% 12` too, and the event that exists to
      // be MISSING its end date cannot be one of the events whose duration that
      // date carries. `addEvent` refuses the pair outright, so the two
      // placements have to be reconciled here rather than discovered later.
      const days = world.eventWindow(
        offset,
        index === 1 || (index % 12 === 0 && !beingPrepared) ? 2 : 1,
      );
      const firstDay = days[0]!;
      // The theme the campus typed after the date, on the sessions the season
      // does not already name. Cycled rather than drawn: a title list is what a
      // reader scans first, and one built entirely from the same three words
      // reads as a fixture whatever the dates say.
      const theme =
        campLabel(firstDay) === null && index % 3 === 0
          ? CLUB_THEMES[index % CLUB_THEMES.length]
          : null;

      const event = world.addEvent({
        key: `evt-${index}`,
        titre: codingClubTitre({
          campus: campus.name,
          date: firstDay,
          suffix: theme,
        }),
        // Only a fifth of events carry a public name; the rest show the raw
        // Salesforce title, which is what staff actually read most of the time.
        publicName: configured ? codingClubPublicName(firstDay) : null,
        cohortNoun: configured ? COHORT_NOUNS.PARTICIPANT : null,
        campus,
        days,
        withEndDate: beingPrepared ? false : undefined,
        devActivated: configured && !beingPrepared,
        // One event created inside Jump rather than synced from a campaign.
        // `externalId` is nullable for exactly that, and with no null row the
        // « pas de campagne Salesforce » rendering, and every branch that skips
        // an event the sync does not own, had no example.
        externalId: index === 3 ? null : undefined,
        modules: configured
          ? offset < 0
            ? runsClosings
              ? [
                  EVENT_MODULES.INSCRITS,
                  EVENT_MODULES.EMARGEMENT,
                  EVENT_MODULES.CLOSINGS,
                ]
              : [EVENT_MODULES.INSCRITS, EVENT_MODULES.EMARGEMENT]
            : [EVENT_MODULES.INSCRITS]
          : [],
        closingTemplateId: runsClosings ? clubTemplateId : null,
      });
      created += 1;
      if (!configured) unconfigured += 1;

      if (noEnrolment) {
        empty += 1;
        continue;
      }

      const cohort = makeCohort(world, {
        size: cohortSize(world, scale),
        campus,
        schoolYear,
      });
      for (const talent of cohort) world.enrol(event, talent);

      // 16% of the platform has walked the onboarding dossier, and that is a
      // property of the talent rather than of the event: applying it only to
      // the stage cohort would leave the compliance and funnel aggregates
      // reading against a couple of hundred rows instead of a thousand.
      for (const talent of cohort) {
        if (!rng.chance(0.16)) continue;
        addDossier(world, {
          talent,
          schoolYear,
          stopAt: null,
          parentCoSigned: rng.chance(0.93),
          imageRights: rng.chance(0.13) ? 'refused' : 'accepted',
          filedOffset: -rng.int(30, 250),
        });
        world.grantXp({
          talent,
          source: 'onboarding',
          sourceId: talent.id,
          amount: WELCOME_XP_BONUS,
        });
      }

      // The closings, on seven in ten of the roster: production's non-stage
      // events that run them sit between 68% and 79%, and the remainder is what
      // a coverage rate and a chase list are read off. Conducted a day after
      // the event, the way a team actually does it.
      if (runsClosings) {
        for (const talent of rng.sample(
          cohort,
          Math.max(1, Math.round(cohort.length * 0.72)),
        )) {
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

      // Émargement on every past event, not only the configured ones. That
      // looks inconsistent and matches production exactly: 229 events carry
      // presence rows while 38 carry the émargement module, because a marked
      // cell outlives the surface being switched on. Gating presence on the
      // module would leave the table an order of magnitude too small. Presence is the
      // largest table in production by an order of magnitude (27 167 rows
      // against 7 638 enrolments), and it is the one table where a query that
      // behaves on fifty rows stops behaving.
      if (offset < 0) {
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
          }
        }
      }
    }

    // A closing-coverage figure distinguishes null (never configured) from a
    // real zero (configured, past, nobody's closing conducted) - see
    // `campusComparison.ts`'s own doc comment on `closingCoverage`. Stage and
    // club always conduct at least one closing wherever they configure the
    // module, so neither ever produces the zero branch: this is the one
    // event in the dataset that does, on a campus neither of them claimed.
    const zeroClosingCampus = world.pickWeightedCampus(
      world.reservedCampusNames,
    );
    const zeroClosingDays = world.eventWindow(-45, 1);
    const zeroClosingEvent = world.addEvent({
      key: 'evt-closings-zero',
      titre: codingClubTitre({
        campus: zeroClosingCampus.name,
        date: zeroClosingDays[0]!,
      }),
      publicName: codingClubPublicName(zeroClosingDays[0]!),
      cohortNoun: COHORT_NOUNS.PARTICIPANT,
      campus: zeroClosingCampus,
      days: zeroClosingDays,
      devActivated: true,
      modules: [
        EVENT_MODULES.INSCRITS,
        EVENT_MODULES.EMARGEMENT,
        EVENT_MODULES.CLOSINGS,
      ],
      closingTemplateId: clubTemplateId,
    });
    const zeroClosingCohort = makeCohort(world, {
      size: cohortSize(world, scale),
      campus: zeroClosingCampus,
      schoolYear,
    });
    for (const talent of zeroClosingCohort)
      world.enrol(zeroClosingEvent, talent);
    // Deliberately no `conductClosing` call: the absence is the point.
    created += 1;

    world.ctx.manifest.push({
      scenario: longTail.name,
      summary: longTail.summary,
      covers: [
        `${created} événements ordinaires répartis sur tous les campus`,
        `${empty} sans aucun inscrit, ${unconfigured} sans aucun module configuré`,
        'un événement à venir, un en cours, un terminé hier',
        'un événement « prêt à publier » que l’activation refuse : il lui manque la date de fin',
        `${zeroClosingCampus.name} : closings configurés, inscrits réels, aucun closing conduit`,
        'des cohortes tirées sur la vraie distribution : médiane autour de 23',
      ],
    });
  },
};
