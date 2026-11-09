/**
 * Is the attendance register actually being kept?
 *
 * Émargement is one half-day at a time: a créneau closes at its 11h/15h cutoff,
 * or earlier when a staff member closes it, and from then on everyone still
 * unmarked reads as absent. So the question that matters operationally is not
 * "how many were present" but "how many elapsed half-days were actually kept":
 * an elapsed créneau with no mark at all is a sheet nobody filled in, which
 * reads as a whole cohort absent.
 *
 * It used to count closure rows, which only an early close by hand writes: the
 * Clôturer button is disabled past the cutoff (`f602becd`), so the figure read
 * close to 0 % whatever the campuses did.
 *
 * The grid comes from `presenceDays` / `presenceSlots`, the same domain helpers
 * the émargement page, the XLSX export and the QR check-in validation use, so
 * "how many créneaux does this event have" has exactly one answer across Jump.
 *
 * Only events that expose the émargement section are considered. An event that
 * never turned it on has no register to keep, and counting it as 0 % covered
 * would turn a deliberate choice into a failure.
 */

import { prisma } from '$lib/server/db';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import {
  presenceSlots,
  dbDateToKey,
  slotKey,
  statusLabelFr,
  type PresenceSlot,
  type PresenceStatus,
} from '$lib/domain/eventPresence';
import { isSlotClosed } from '$lib/server/presence/slotClosure';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { scopedEvents, scopeLabels } from './cohort';
import { sinceLabelFr, type SinceFilter } from './since';
import { getEventStatus, getLifecycleBounds } from '$lib/domain/eventLifecycle';

/** Events detailed one by one before the answer stops listing them. */
export const EMARGEMENT_EVENTS_LIMIT = 40;

/**
 * The order the per-event list is capped in: the registers with a half-day
 * nobody filled in first, since they are what the list is read for, then the
 * rest; each group most recent first, the order the events arrive in. Dated
 * alone, the cap filled with upcoming events (most recent first means furthest
 * ahead first, and `since` keeps every one of them), so the weekly digest
 * counted last week's unkept registers and could not name them.
 */
function unkeptFirst(a: EventCoverage, b: EventCoverage): number {
  return Number(b.unkeptSlots > 0) - Number(a.unkeptSlots > 0);
}

export type EventCoverage = {
  eventId: string;
  event: string;
  campus: string;
  dateLabel: string;
  status: string;
  slots: number;
  elapsedSlots: number;
  keptSlots: number;
  /** Elapsed half-days with no mark at all: sheets nobody filled in. */
  unkeptSlots: number;
  /** Percentage of this event's elapsed half-days that hold a mark. */
  keptShare: number | null;
  marks: number;
};

export type EmargementCoverage = {
  filters: {
    schoolYear: string;
    campus: string;
    event: string;
    /** The `since` instant applied, ISO 8601, or null for every event. */
    since: string | null;
  };
  events: Metric;
  slots: Metric;
  elapsedSlots: Metric;
  keptSlots: Metric;
  keptShare: Metric<number | null>;
  eventsWithUnkeptSlots: Metric;
  marks: Metric;
  byStatus: Metric<
    { status: string; label: string; count: number; share: number | null }[]
  >;
  perEvent: Metric<EventCoverage[]>;
  truncated: boolean;
};

/**
 * `since` keeps the events still under way at that instant or after it: an
 * event already over by then (in its campus's calendar, the rule
 * `getEventStatus` holds) is left out, totals included. It is how the weekly
 * digest asks about last week's registers without the whole year's.
 */
export async function getEmargementCoverage(
  scope: Scope = {},
  filters: SinceFilter = {},
): Promise<EmargementCoverage> {
  const { since } = filters;
  const { events } = await scopedEvents(scope);
  const withModule = events.filter((e) =>
    e.modules.includes(EVENT_MODULES.EMARGEMENT),
  );
  if (withModule.length === 0) return empty(scope, since);

  const allRows = await prisma.event.findMany({
    where: { id: { in: withModule.map((e) => e.id) } },
    select: {
      id: true,
      date: true,
      endDate: true,
      startMinutes: true,
      campus: { select: { timezone: true } },
      _count: { select: { eventPresences: true } },
    },
  });
  const rows = since
    ? allRows.filter(
        (row) =>
          getEventStatus(
            row,
            getLifecycleBounds(row.campus.timezone, since),
          ) !== 'past',
      )
    : allRows;
  const inWindow = new Set(rows.map((row) => row.id));
  const withRegister = withModule
    .filter((e) => inWindow.has(e.id))
    .sort((a, b) => b.dateTs - a.dateTs);

  if (withRegister.length === 0) return empty(scope, since);

  const ids = withRegister.map((e) => e.id);
  const [closures, markedSlots, statuses] = await Promise.all([
    prisma.eventPresenceClosure.findMany({
      where: { eventId: { in: ids } },
      select: { eventId: true, day: true, slot: true },
    }),
    prisma.eventPresence.groupBy({
      by: ['eventId', 'day', 'slot'],
      where: { eventId: { in: ids } },
    }),
    prisma.eventPresence.groupBy({
      by: ['status'],
      where: { eventId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const now = new Date();
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const closuresByEvent = new Map<
    string,
    { day: Date; slot: PresenceSlot }[]
  >();
  for (const closure of closures) {
    const list = closuresByEvent.get(closure.eventId) ?? [];
    list.push(closure);
    closuresByEvent.set(closure.eventId, list);
  }
  // Marks and closures are read against the event's own grid, so one on a day
  // outside its window (an old date the event was moved off) counts for nothing.
  const markedByEvent = new Map<string, Set<string>>();
  for (const marked of markedSlots) {
    const set = markedByEvent.get(marked.eventId) ?? new Set<string>();
    set.add(slotKey(dbDateToKey(marked.day), marked.slot));
    markedByEvent.set(marked.eventId, set);
  }

  const perEvent: EventCoverage[] = withRegister.map((event) => {
    const row = rowById.get(event.id);
    const slots = row
      ? presenceSlots(
          {
            date: row.date,
            endDate: row.endDate,
            startMinutes: row.startMinutes,
          },
          row.campus.timezone,
        )
      : [];
    const manualCloses = closuresByEvent.get(event.id) ?? [];
    const marked = markedByEvent.get(event.id) ?? new Set<string>();
    const elapsed = row
      ? slots.filter((s) =>
          isSlotClosed(s.day, s.slot, manualCloses, row.campus.timezone, now),
        )
      : [];
    const kept = elapsed.filter((s) => marked.has(s.key));
    return {
      eventId: event.id,
      event: event.displayName,
      campus: event.campusName,
      dateLabel: event.dateLabel,
      status: event.status,
      slots: slots.length,
      elapsedSlots: elapsed.length,
      keptSlots: kept.length,
      unkeptSlots: elapsed.length - kept.length,
      keptShare: share(kept.length, elapsed.length),
      marks: row?._count.eventPresences ?? 0,
    };
  });

  // Stable, so the date order of `withRegister` holds within each group.
  perEvent.sort(unkeptFirst);

  const totalSlots = perEvent.reduce((sum, e) => sum + e.slots, 0);
  const totalElapsed = perEvent.reduce((sum, e) => sum + e.elapsedSlots, 0);
  const totalKept = perEvent.reduce((sum, e) => sum + e.keptSlots, 0);
  const totalMarks = statuses.reduce((sum, s) => sum + s._count._all, 0);

  return {
    filters: { ...scopeLabels(scope), since: since?.toISOString() ?? null },
    events: metric(
      withRegister.length,
      `Événements du périmètre dont la section émargement est activée${since ? `, encore en cours ${sinceLabelFr(since)} ou plus tard` : ''}. Les autres n'ont pas de feuille de présence à tenir et sont ignorés ici.`,
    ),
    slots: metric(
      totalSlots,
      "Nombre total de demi-journées à émarger sur ces événements. Une journée compte pour deux créneaux (matin et après-midi), sauf le premier jour d'un événement dont l'heure de début est l'après-midi (13h00 ou plus tard), qui ne compte que l'après-midi ; un événement de plusieurs jours ne compte que ses jours ouvrés.",
    ),
    elapsedSlots: metric(
      totalElapsed,
      "Demi-journées écoulées : celles dont l'heure de clôture est passée (11h00 pour le matin, 15h00 pour l'après-midi, à l'heure du campus) et celles qu'un membre de l'équipe a clôturées plus tôt. Dans une demi-journée écoulée, un talent sans pointage compte comme absent.",
    ),
    keptSlots: metric(
      totalKept,
      "Demi-journées écoulées où au moins un pointage a été enregistré, par l'équipe ou par le talent lui-même avec le code de pointage. Une demi-journée écoulée sans aucun pointage est une feuille que personne n'a tenue : toute la cohorte y compte comme absente.",
    ),
    keptShare: metric(
      share(totalKept, totalElapsed),
      "Part des demi-journées écoulées où au moins un pointage a été enregistré, en pourcentage. Seules les demi-journées écoulées y entrent : un événement qui n'a pas encore eu lieu ne fait pas baisser ce chiffre, sauf un créneau qu'un membre de l'équipe a clôturé à l'avance.",
    ),
    eventsWithUnkeptSlots: metric(
      perEvent.filter((e) => e.unkeptSlots > 0).length,
      'Événements qui ont au moins une demi-journée écoulée sans aucun pointage, comptés sur tous les événements et non sur la liste plafonnée. Sur chacun, la cohorte compte comme absente de ces demi-journées tant que personne ne remplit la feuille.',
    ),
    marks: metric(
      totalMarks,
      "Pointages enregistrés sur ces événements, tous statuts confondus. C'est le dénominateur de la répartition ci-dessous.",
    ),
    byStatus: metric(
      statuses.map((s) => ({
        status: s.status,
        label: statusLabelFr(s.status as PresenceStatus),
        count: s._count._all,
        share: share(s._count._all, totalMarks),
      })),
      "Répartition des pointages enregistrés sur ces événements, « share » étant la part de tous les pointages, en pourcentage. Un talent sans ligne n'est pas encore traité et n'apparaît dans aucune de ces catégories : ces parts portent sur les pointages, pas sur la cohorte.",
    ),
    perEvent: metric(
      perEvent.slice(0, EMARGEMENT_EVENTS_LIMIT),
      `Le détail événement par événement, limité à ${EMARGEMENT_EVENTS_LIMIT} lignes : d'abord ceux qui ont au moins une demi-journée écoulée sans aucun pointage, puis les autres, chaque groupe du plus récent au plus ancien. « elapsedSlots », « keptSlots » et « keptShare » s'y lisent comme les chiffres du même nom, pour cet événement seul ; « unkeptSlots » compte ses demi-journées écoulées sans aucun pointage ; « marks » est le nombre de pointages enregistrés, tous statuts confondus.`,
    ),
    truncated: perEvent.length > EMARGEMENT_EVENTS_LIMIT,
  };
}

function empty(scope: Scope, since: Date | undefined): EmargementCoverage {
  const none = since
    ? `Aucun événement du périmètre n'a la section émargement activée et n'était encore en cours ${sinceLabelFr(since)} ou plus tard : il n'y a pas de feuille de présence à tenir.`
    : "Aucun événement du périmètre n'a la section émargement activée : il n'y a pas de feuille de présence à tenir.";
  return {
    filters: { ...scopeLabels(scope), since: since?.toISOString() ?? null },
    events: metric(0, none),
    slots: metric(0, none),
    elapsedSlots: metric(0, none),
    keptSlots: metric(0, none),
    keptShare: metric(null, none),
    eventsWithUnkeptSlots: metric(0, none),
    marks: metric(0, none),
    byStatus: metric([], none),
    perEvent: metric([], none),
    truncated: false,
  };
}
