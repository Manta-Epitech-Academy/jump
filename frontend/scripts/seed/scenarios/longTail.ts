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
import { WELCOME_XP_BONUS } from '../../../src/lib/domain/xp';
import { addDossier } from '../factories/onboarding';
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

    let created = 0;
    let empty = 0;
    let unconfigured = 0;

    for (let index = 0; index < target; index += 1) {
      const campus = campuses[index % campuses.length]!;
      const team = world.staffFor(campus.id);

      // 14% of events have nobody on them, and 80% were never configured. Both
      // are the ordinary case, not a defect to seed around.
      const noEnrolment = index % 7 === 0;
      const configured = index % 5 === 0;

      // One of each lifecycle branch, then a spread across the school year.
      const offset =
        index === 0 ? 3 : index === 1 ? 0 : index === 2 ? -1 : -rng.int(5, 300);

      const event = world.addEvent({
        key: `evt-${index}`,
        titre: `Journée découverte ${campus.name} #${index + 1}`,
        // Only a fifth of events carry a public name; the rest show the raw
        // Salesforce title, which is what staff actually read most of the time.
        publicName: configured ? `Découverte ${campus.name}` : null,
        cohortNoun: configured ? 'participants' : null,
        campus,
        startOffset: offset,
        // A handful run over several days. Production has 16 of them, and a
        // multi-day event is the only thing that makes the émargement day
        // picker do anything.
        weekdays: index === 1 || index % 12 === 0 ? 3 : 1,
        devActivated: configured,
        modules: configured
          ? offset < 0
            ? [EVENT_MODULES.INSCRITS, EVENT_MODULES.EMARGEMENT]
            : [EVENT_MODULES.INSCRITS]
          : [],
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

    world.ctx.manifest.push({
      scenario: longTail.name,
      summary: longTail.summary,
      covers: [
        `${created} événements ordinaires répartis sur tous les campus`,
        `${empty} sans aucun inscrit, ${unconfigured} sans aucun module configuré`,
        'un événement à venir, un en cours, un terminé hier',
        'des cohortes tirées sur la vraie distribution : médiane autour de 23',
      ],
    });
  },
};
