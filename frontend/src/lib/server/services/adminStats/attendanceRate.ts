/**
 * Of the students who signed up, how many actually turned up.
 *
 * For a past event Salesforce's member status IS the presence record: MEET means
 * they came, READY means they said they would and did not
 * (`domain/sfMemberStatus.pastEventPresence`). That mapping is a business rule
 * fixed at the July 2026 seminar, it lives in the domain module, and this
 * aggregate reads it rather than restating it.
 *
 * Past events only. A future event has nobody to have shown up yet, and an
 * ongoing one is still being marked, so including either would drag the rate
 * towards zero for reasons that say nothing about attendance.
 *
 * Two exclusions, and the difference between them is the whole reason the figures
 * below are worded the way they are. A désisté enrolment is not in the cohort
 * Jump shows at all, so it is filtered out before anything is counted, exactly
 * like everywhere else in this folder. An enrolment Jump *does* show but whose
 * status concludes nothing (imported before `Participation.sfMemberStatus`
 * existed, which is every row synced before July 2026 that no later sync
 * refreshed) is counted, in `unknown`, and kept out of the rate rather than read
 * as an absence: the platform does not know, and a rate that says otherwise is
 * worse than one that admits the gap.
 */

import { prisma } from '$lib/server/db';
import {
  pastEventPresence,
  visibleParticipationWhere,
  VISIBLE_PARTICIPATION_DEFINITION,
} from '$lib/domain/sfMemberStatus';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { scopedEvents, scopeLabels } from './cohort';

/** Events detailed one by one before the answer stops listing them. */
export const ATTENDANCE_EVENTS_LIMIT = 60;

/**
 * The show-up rule, owned here and imported by the campus comparison, which ranks
 * campuses on it. Stating the denominator is the whole point: the rate is over the
 * enrolments whose status concludes something, never over every enrolment.
 */
export const SHOW_UP_RATE_RULE =
  'Part des inscriptions exploitables qui ont donné lieu à une présence, en pourcentage, sur les événements déjà terminés. Une inscription est exploitable quand son statut Salesforce conclut sur la venue : MEET (venue) ou READY (pas venue). Celles sans statut exploitable sont exclues du calcul plutôt que comptées comme des absences.';

export type EventAttendance = {
  eventId: string;
  event: string;
  campus: string;
  dateLabel: string;
  enrolled: number;
  present: number;
  absent: number;
  /** Shown by Jump, but neither MEET nor READY: no usable presence signal. */
  unknown: number;
  /** Percentage of enrolments that turned into a presence. */
  showUpRate: number | null;
};

export type AttendanceRate = {
  filters: { schoolYear: string; campus: string; event: string };
  pastEvents: Metric;
  enrolled: Metric;
  present: Metric;
  absent: Metric;
  unknown: Metric;
  showUpRate: Metric<number | null>;
  perEvent: Metric<EventAttendance[]>;
  truncated: boolean;
};

export async function getAttendanceRate(
  scope: Scope = {},
): Promise<AttendanceRate> {
  const { events } = await scopedEvents(scope);
  const past = events
    .filter((e) => e.status === 'past')
    .sort((a, b) => b.dateTs - a.dateTs);

  if (past.length === 0) return empty(scope);

  const grouped = await prisma.participation.groupBy({
    by: ['eventId', 'sfMemberStatus'],
    where: {
      eventId: { in: past.map((e) => e.id) },
      // The same cohort every other aggregate counts. Without it, a désisté
      // enrolment landed in `unknown`, where a figure described as "no usable
      // presence signal" was quietly also counting people who withdrew.
      ...visibleParticipationWhere,
    },
    _count: { _all: true },
  });

  const tallies = new Map<
    string,
    { present: number; absent: number; unknown: number }
  >();
  for (const row of grouped) {
    const tally = tallies.get(row.eventId) ?? {
      present: 0,
      absent: 0,
      unknown: 0,
    };
    const presence = pastEventPresence(row.sfMemberStatus);
    if (presence === 'present') tally.present += row._count._all;
    else if (presence === 'absent') tally.absent += row._count._all;
    else tally.unknown += row._count._all;
    tallies.set(row.eventId, tally);
  }

  const perEvent: EventAttendance[] = past.map((event) => {
    const tally = tallies.get(event.id) ?? {
      present: 0,
      absent: 0,
      unknown: 0,
    };
    // MEET + READY only. Deliberately NOT every enrolment the dev workspace
    // lists: a status-less row belongs to no side of this ratio, so it sits in
    // `unknown` and the denominator stays the population the answer can speak
    // for. `enrolled + unknown` is what the workspace shows.
    const enrolled = tally.present + tally.absent;
    return {
      eventId: event.id,
      event: event.displayName,
      campus: event.campusName,
      dateLabel: event.dateLabel,
      enrolled,
      present: tally.present,
      absent: tally.absent,
      unknown: tally.unknown,
      showUpRate: share(tally.present, enrolled),
    };
  });

  const sum = (pick: (row: EventAttendance) => number) =>
    perEvent.reduce((total, row) => total + pick(row), 0);
  const enrolled = sum((r) => r.enrolled);
  const present = sum((r) => r.present);

  return {
    filters: scopeLabels(scope),
    pastEvents: metric(
      past.length,
      'Événements du périmètre déjà terminés. Les événements à venir ou en cours sont exclus : personne ne peut encore y être venu.',
    ),
    enrolled: metric(
      enrolled,
      "Inscriptions à ces événements passés dont le statut Salesforce conclut sur la venue : MEET (la personne est venue) ou READY (elle ne l'est pas). C'est le dénominateur du taux de présence. Les inscriptions sans statut exploitable n'y figurent pas, elles sont comptées dans « unknown » ; la somme des deux correspond aux inscriptions affichées dans l'espace dev.",
    ),
    present: metric(
      present,
      'Inscriptions dont le statut Salesforce vaut MEET après coup, ce qui signifie que la personne est venue.',
    ),
    absent: metric(
      sum((r) => r.absent),
      "Inscriptions restées au statut Salesforce READY après l'événement : la personne s'était inscrite et n'est pas venue.",
    ),
    unknown: metric(
      sum((r) => r.unknown),
      `Inscriptions à ces événements passés sans statut de présence exploitable, ${VISIBLE_PARTICIPATION_DEFINITION} : en pratique celles importées avant que Jump n'enregistre le statut Salesforce, et que jamais aucune synchronisation ultérieure n'a rafraîchies. Elles sont exclues du taux plutôt que comptées comme des absences, car leur statut ne dit rien de leur venue. Un chiffre élevé face à « enrolled » signifie que le taux ne porte que sur une partie des inscrits.`,
    ),
    showUpRate: metric(
      share(present, enrolled),
      `${SHOW_UP_RATE_RULE} Porte ici sur tous les événements passés du périmètre. Vaut null si aucune inscription exploitable.`,
    ),
    perEvent: metric(
      perEvent.slice(0, ATTENDANCE_EVENTS_LIMIT),
      `Le même comptage événement par événement, du plus récent au plus ancien, limité à ${ATTENDANCE_EVENTS_LIMIT} lignes.`,
    ),
    truncated: perEvent.length > ATTENDANCE_EVENTS_LIMIT,
  };
}

/** Nothing has happened yet on this périmètre: zeros, but no invented rate. */
function empty(scope: Scope): AttendanceRate {
  const none = (definition: string) => metric(0, definition);
  return {
    filters: scopeLabels(scope),
    pastEvents: none(
      "Aucun événement terminé sur ce périmètre : il n'y a pas encore de présence à mesurer.",
    ),
    enrolled: none('Aucun événement terminé sur ce périmètre.'),
    present: none('Aucun événement terminé sur ce périmètre.'),
    absent: none('Aucun événement terminé sur ce périmètre.'),
    unknown: none('Aucun événement terminé sur ce périmètre.'),
    showUpRate: metric(
      null,
      "Taux de présence non calculable : aucun événement du périmètre n'est terminé.",
    ),
    perEvent: metric([], 'Aucun événement terminé sur ce périmètre.'),
    truncated: false,
  };
}
