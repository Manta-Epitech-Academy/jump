/**
 * The Salesforce member statuses, and what they do to a screen.
 *
 * The dev space shows `READY` and `MET` and hides `CONNECTED` and `DESISTED`,
 * and `visibleParticipationWhere` spreads that rule through fifteen files - the
 * enrolment lists, émargement, the talent fiche, and the admin figures behind
 * `cohortOverview` and `feedbackResults`. None of it had ever
 * been visible anywhere: the sync stopped on 2026-07-09, twelve days before the
 * column was added, so every row in production and in this generator was null
 * and every filter admitted everything.
 *
 * So this event is where the rule becomes something a person can look at. It
 * carries every status at once, and the counts deliberately disagree: more
 * enrolled than visible, which is exactly what the admin inspector exists to
 * explain.
 *
 * It also carries one word Jump does not know, the way Salesforce would send
 * one the day a status is added or renamed (#368: the seminar wrote `MEET`, the
 * CRM sends `MET`, and every attendee vanished from the dev space without a
 * sound). That row is masked like a hidden one and reported where a hidden one
 * is not: a warning badge in the admin inspector, `unrecognisedStatuses` in
 * `stats_sync_health`, a line in the weekly digest.
 *
 * Sizes are fixed per profile and the groups are cut by index, never drawn: the
 * assertions in `assert/reachability.ts` depend on each group being non-empty,
 * and `--check` runs the smallest profile there is.
 */

import { codingClubTitre } from '../catalog/events';
import { EVENT_MODULES } from '../../../src/lib/domain/eventModules';
import { COHORT_NOUNS, eventDisplayName } from '../../../src/lib/domain/event';
import {
  DEFAULT_SHOWN_STATUSES,
  SF_STATUSES,
  UNRECOGNISED_SF_STATUS_SAMPLE,
} from '../world';
import { makeCohort } from './helpers';
import type { Scenario } from './types';

export const sfStatuses: Scenario = {
  name: 'statuts-salesforce',
  summary:
    'Les statuts Salesforce, dont un que Jump ne connaît pas : ce que l’espace dev montre et ce qu’il cache, réglé événement par événement.',
  run(world) {
    const { profile, clock } = world.ctx;
    const campus = [...world.campuses.values()][0]!;

    // Far enough back that the weekday walk in `eventWindow`, which only ever
    // moves forward to clear a weekend, cannot land on or after the anchor.
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

    const size = profile.name === 'ci' ? 13 : 25;
    const cohort = makeCohort(world, {
      size,
      campus,
      schoolYear: clock.schoolYear,
    });

    // Cut by index, so every group is the same size on every run and in every
    // profile. A draw here would make the assertions probabilistic.
    const third = Math.floor(size / 3);
    const attended = cohort.slice(0, third);
    const confirmed = cohort.slice(third, third * 2);
    const connected = cohort[third * 2]!;
    const desisted = cohort[third * 2 + 1]!;
    const unrecognised = cohort[third * 2 + 2]!;
    const legacy = cohort.slice(third * 2 + 3);

    // Shown: the two words the dev space displays.
    for (const talent of attended) {
      world.enrol(event, talent, { sfMemberStatus: SF_STATUSES.attended });
    }
    for (const talent of confirmed) {
      world.enrol(event, talent, { sfMemberStatus: SF_STATUSES.confirmed });
    }
    // Hidden: enrolled, never shown in the dev space. The gap between the two
    // counts is the whole point of the admin inspector.
    world.enrol(event, connected, { sfMemberStatus: SF_STATUSES.connected });
    world.enrol(event, desisted, { sfMemberStatus: SF_STATUSES.desisted });
    // Masked like the two above, but reported: nobody decided to hide it.
    world.enrol(event, unrecognised, {
      sfMemberStatus: UNRECOGNISED_SF_STATUS_SAMPLE,
    });
    // Legacy rows, synced before the column existed: shown, and the only null
    // statuses in the dataset.
    for (const talent of legacy) {
      world.enrol(event, talent, { sfMemberStatus: null });
    }

    world.ctx.manifest.push({
      scenario: sfStatuses.name,
      summary: sfStatuses.summary,
      campus: campus.name,
      event: eventDisplayName(event),
      covers: [
        'Inscrits : le compte visible est inférieur au compte inscrit, trois participations étant masquées',
        'Inspecter les statuts Salesforce (espace admin) : les statuts bruts, le partage visible / masqué, et un statut inconnu de Jump signalé comme tel',
        'Statuts Salesforce reçus (API d’administration, stats_sync_health) : un statut inconnu compté et rattaché à cet événement, repris par le digest hebdomadaire',
        'Des inscriptions sans statut, comme avant la synchronisation de juillet 2026',
      ],
    });

    // The same word, shown on one event and masked on the other: a Coding Club
    // wants the members Salesforce leaves at CONNECTED, the open day above does
    // not. One talent is on both, so the difference reads on one person.
    const clubDays = world.eventWindow(-8, 1);
    const club = world.addEvent({
      key: 'statuts-salesforce-club',
      titre: codingClubTitre({ campus: campus.name, date: clubDays[0]! }),
      publicName: `Coding Club ${campus.name}`,
      cohortNoun: COHORT_NOUNS.PARTICIPANT,
      campus,
      days: clubDays,
      startMinutes: 14 * 60,
      devActivated: true,
      modules: [EVENT_MODULES.INSCRITS],
      shownStatuses: [...DEFAULT_SHOWN_STATUSES, SF_STATUSES.connected],
    });
    const clubCohort = makeCohort(world, {
      size: profile.name === 'ci' ? 4 : 8,
      campus,
      schoolYear: clock.schoolYear,
    });
    const half = Math.floor(clubCohort.length / 2);
    world.enrol(club, connected, { sfMemberStatus: SF_STATUSES.connected });
    for (const talent of clubCohort.slice(0, half)) {
      world.enrol(club, talent, { sfMemberStatus: SF_STATUSES.connected });
    }
    for (const talent of clubCohort.slice(half)) {
      world.enrol(club, talent, { sfMemberStatus: SF_STATUSES.attended });
    }

    world.ctx.manifest.push({
      scenario: sfStatuses.name,
      summary: sfStatuses.summary,
      campus: campus.name,
      event: eventDisplayName(club),
      covers: [
        `Inscrits : les membres restés à ${SF_STATUSES.connected} sont affichés, parce que cet événement affiche ce statut`,
        `Le même talent au statut ${SF_STATUSES.connected} est affiché ici et masqué sur la journée portes ouvertes`,
        'Configuration de l’événement (espace admin) : les statuts Salesforce affichés, réglés pour cet événement',
      ],
    });
  },
};
