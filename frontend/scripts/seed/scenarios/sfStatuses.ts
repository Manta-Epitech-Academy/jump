/**
 * The Salesforce member statuses, and what they do to a screen.
 *
 * The dev space shows `READY` and `MEET` and hides `CONNECTED` and `DESISTED`,
 * and `visibleParticipationWhere` spreads that rule through fifteen files - the
 * enrolment lists, émargement, the talent fiche, and the admin figures behind
 * `cohortOverview`, `attendanceRate` and `feedbackResults`. None of it had ever
 * been visible anywhere: the sync stopped on 2026-07-09, twelve days before the
 * column was added, so every row in production and in this generator was null
 * and every filter admitted everything.
 *
 * So this event is where the rule becomes something a person can look at. It
 * carries every status at once, and the counts deliberately disagree: more
 * enrolled than visible, which is exactly what the admin inspector exists to
 * explain.
 *
 * It also carries the one presence state nothing else in the dataset produces: a
 * cell nobody marked, in a slot that is closed, on a single-day event. That is
 * the only shape in which `effectiveStatus` consults Salesforce at all - a
 * `MEET` reads présent, a `READY` reads absent - and one cell contradicts it on
 * purpose, because "a manual mark always wins" is a rule you can only see by
 * breaking it.
 *
 * Sizes are fixed per profile and the groups are cut by index, never drawn: the
 * assertions in `assert/reachability.ts` depend on each group being non-empty,
 * and `--check` runs the smallest profile there is.
 */

import { codingClubTitre } from '../catalog/events';
import { EVENT_MODULES } from '../../../src/lib/domain/eventModules';
import { COHORT_NOUNS, eventDisplayName } from '../../../src/lib/domain/event';
import { makeCohort } from './helpers';
import type { Scenario } from './types';

export const sfStatuses: Scenario = {
  name: 'statuts-salesforce',
  summary:
    'Les quatre statuts Salesforce sur un même événement : ce que l’espace dev montre, ce qu’il cache, et la présence qu’il déduit.',
  run(world) {
    const { profile, clock } = world.ctx;
    const campus = [...world.campuses.values()][0]!;
    const team = world.staffFor(campus.id);

    // Far enough back that the weekday walk in `eventWindow`, which only ever
    // moves forward to clear a weekend, cannot land on or after the anchor.
    //
    // Single-day, and this is load-bearing rather than incidental: the
    // Salesforce fallback in `effectiveStatus` only fires when the event has
    // two slots or fewer.
    const days = world.eventWindow(-3, 1);
    const event = world.addEvent({
      key: 'statuts-salesforce',
      // An open day, which the campus runs as a Coding Club and the CRM names
      // like every other one. `publicName` is what carries « portes ouvertes »,
      // and it is the whole reason that column exists.
      titre: codingClubTitre({
        campus: campus.name,
        date: days[0]!,
        suffix: 'JPO',
      }),
      publicName: `Portes ouvertes ${campus.name}`,
      cohortNoun: COHORT_NOUNS.PARTICIPANT,
      campus,
      days,
      startMinutes: 9 * 60,
      devActivated: true,
      modules: [EVENT_MODULES.INSCRITS, EVENT_MODULES.EMARGEMENT],
    });

    const size = profile.name === 'ci' ? 12 : 24;
    const cohort = makeCohort(world, {
      size,
      campus,
      schoolYear: clock.schoolYear,
    });

    // Cut by index, so every group is the same size on every run and in every
    // profile. A draw here would make the assertions probabilistic.
    const third = Math.floor(size / 3);
    const meetUnmarked = cohort.slice(0, third);
    const readyUnmarked = cohort.slice(third, third * 2);
    const contradicted = cohort[third * 2]!;
    const connected = cohort[third * 2 + 1]!;
    const desisted = cohort[third * 2 + 2]!;
    const legacy = cohort.slice(third * 2 + 3);

    // Visible, unmarked: the closed slot projects présent from Salesforce.
    for (const talent of meetUnmarked) {
      world.enrol(event, talent, { sfMemberStatus: 'MEET' });
    }
    // Visible, unmarked: signed up, never came. The same slot reads absent.
    for (const talent of readyUnmarked) {
      world.enrol(event, talent, { sfMemberStatus: 'READY' });
    }
    // Hidden: enrolled, never shown in the dev space. The gap between the two
    // counts is the whole point of the admin inspector.
    world.enrol(event, connected, { sfMemberStatus: 'CONNECTED' });
    world.enrol(event, desisted, { sfMemberStatus: 'DESISTED' });
    // Legacy rows, synced before the column existed. They keep `unknownShare` in
    // `adminStats/attendanceRate` non-zero, which is a branch nothing else feeds.
    for (const talent of legacy) {
      world.enrol(event, talent, { sfMemberStatus: null });
    }

    // The contradiction. Salesforce says they came, a human says they did not,
    // and the stored mark wins.
    world.enrol(event, contradicted, { sfMemberStatus: 'MEET' });
    world.markPresence({
      event,
      talent: contradicted,
      day: event.days[0]!,
      slot: 'morning',
      status: 'absent',
      source: 'manual',
      markedBy: team[0] ?? null,
    });
    // `absent` rather than `present`, deliberately: a présent mark feeds
    // `Talent.eventsCount`, and on a row the dev space hides that would give a
    // fiche reading "3 événements" above a list of two - a divergence
    // `assert/projections.ts` cannot see, since it compares the counter to the
    // presence ledger, which has no notion of visibility.

    // Morning only. A manual closure makes "tout présent" refuse the slot, so
    // leaving the afternoon open keeps that action demonstrable on this event.
    // Written rather than left to the clock: `isSlotPastCutoff` would close it
    // anyway, which would make the dataset mean different things at different
    // hours.
    world.closeSlot(event, event.days[0]!, 'morning', team[0] ?? null);

    world.ctx.manifest.push({
      scenario: sfStatuses.name,
      summary: sfStatuses.summary,
      campus: campus.name,
      event: eventDisplayName(event),
      covers: [
        'Inscrits : le compte visible est inférieur au compte inscrit, deux participations étant masquées',
        'Inspecter les statuts Salesforce (espace admin) : les quatre statuts bruts et le partage visible / masqué',
        'Émargement, créneau du matin clos : un MEET non marqué lit « présent », un READY non marqué lit « absent »',
        'Une marque manuelle « absent » sur un MEET : la saisie humaine l’emporte sur Salesforce',
        'Des inscriptions sans statut, comme avant la synchronisation de juillet 2026',
        'Créneau de l’après-midi laissé ouvert : « tout présent » et la clôture restent exerçables',
      ],
    });
  },
};
