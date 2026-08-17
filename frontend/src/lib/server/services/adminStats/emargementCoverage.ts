/**
 * Is the attendance register actually being kept?
 *
 * Émargement is one half-day at a time: a créneau is closed by staff (or by the
 * clock), and closing it turns everyone still pending into an absence. So the
 * question that matters operationally is not "how many were present" but "how
 * many half-days were actually handled", because an unclosed créneau leaves a
 * cohort in limbo and an export that lies by omission.
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
  type PresenceStatus,
} from '$lib/domain/eventPresence';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { scopedEvents, scopeLabels } from './cohort';

/** Events detailed one by one before the answer stops listing them. */
export const EMARGEMENT_EVENTS_LIMIT = 40;

export type EventCoverage = {
  eventId: string;
  event: string;
  campus: string;
  dateLabel: string;
  status: string;
  slots: number;
  closedSlots: number;
  /** Percentage of this event's half-days that have been closed. */
  closedShare: number | null;
  marks: number;
};

export type EmargementCoverage = {
  filters: { schoolYear: string; campus: string; event: string };
  events: Metric;
  slots: Metric;
  closedSlots: Metric;
  closedShare: Metric<number | null>;
  byStatus: Metric<{ status: string; label: string; count: number }[]>;
  perEvent: Metric<EventCoverage[]>;
  truncated: boolean;
};

export async function getEmargementCoverage(
  scope: Scope = {},
): Promise<EmargementCoverage> {
  const { events } = await scopedEvents(scope);
  const withRegister = events
    .filter((e) => e.modules.includes(EVENT_MODULES.EMARGEMENT))
    .sort((a, b) => b.dateTs - a.dateTs);

  if (withRegister.length === 0) return empty(scope);

  const ids = withRegister.map((e) => e.id);
  const [rows, closures, statuses] = await Promise.all([
    prisma.event.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        date: true,
        endDate: true,
        campus: { select: { timezone: true } },
        _count: { select: { eventPresences: true } },
      },
    }),
    prisma.eventPresenceClosure.findMany({
      where: { eventId: { in: ids } },
      select: { eventId: true, day: true, slot: true },
    }),
    prisma.eventPresence.groupBy({
      by: ['status'],
      where: { eventId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const rowById = new Map(rows.map((r) => [r.id, r]));
  // Closures are keyed on (day, slot) exactly like the grid, so a closure for a
  // day outside the event's window (an old date the event was moved off) does
  // not inflate the count past the number of créneaux that exist.
  const closedByEvent = new Map<string, Set<string>>();
  for (const closure of closures) {
    const set = closedByEvent.get(closure.eventId) ?? new Set<string>();
    set.add(slotKey(dbDateToKey(closure.day), closure.slot));
    closedByEvent.set(closure.eventId, set);
  }

  const perEvent: EventCoverage[] = withRegister.map((event) => {
    const row = rowById.get(event.id);
    const slots = row
      ? presenceSlots(
          { date: row.date, endDate: row.endDate },
          row.campus.timezone,
        )
      : [];
    const closed = closedByEvent.get(event.id) ?? new Set<string>();
    const closedSlots = slots.filter((s) => closed.has(s.key)).length;
    return {
      eventId: event.id,
      event: event.displayName,
      campus: event.campusName,
      dateLabel: event.dateLabel,
      status: event.status,
      slots: slots.length,
      closedSlots,
      closedShare: share(closedSlots, slots.length),
      marks: row?._count.eventPresences ?? 0,
    };
  });

  const totalSlots = perEvent.reduce((sum, e) => sum + e.slots, 0);
  const totalClosed = perEvent.reduce((sum, e) => sum + e.closedSlots, 0);

  return {
    filters: scopeLabels(scope),
    events: metric(
      withRegister.length,
      "Événements du périmètre dont la section émargement est activée. Les autres n'ont pas de feuille de présence à tenir et sont ignorés ici.",
    ),
    slots: metric(
      totalSlots,
      'Nombre total de demi-journées à émarger sur ces événements. Une journée compte pour deux créneaux (matin et après-midi) ; un événement de plusieurs jours ne compte que ses jours ouvrés.',
    ),
    closedSlots: metric(
      totalClosed,
      "Demi-journées clôturées. Clôturer un créneau interdit l'arrivée tardive et bascule en absence tous ceux qui n'ont pas été pointés : tant que ce n'est pas fait, la feuille n'est pas définitive.",
    ),
    closedShare: metric(
      share(totalClosed, totalSlots),
      "Part des demi-journées clôturées sur le périmètre, en pourcentage. Un événement à venir fait naturellement baisser ce chiffre : ses créneaux existent déjà mais n'ont pas encore eu lieu.",
    ),
    byStatus: metric(
      statuses.map((s) => ({
        status: s.status,
        label: statusLabelFr(s.status as PresenceStatus),
        count: s._count._all,
      })),
      "Répartition des pointages enregistrés sur ces événements. Un talent sans ligne n'est pas encore traité et n'apparaît donc dans aucune de ces catégories.",
    ),
    perEvent: metric(
      perEvent.slice(0, EMARGEMENT_EVENTS_LIMIT),
      `Le détail événement par événement, du plus récent au plus ancien, limité à ${EMARGEMENT_EVENTS_LIMIT} lignes. « marks » est le nombre de pointages enregistrés, tous statuts confondus.`,
    ),
    truncated: perEvent.length > EMARGEMENT_EVENTS_LIMIT,
  };
}

function empty(scope: Scope): EmargementCoverage {
  const none =
    "Aucun événement du périmètre n'a la section émargement activée : il n'y a pas de feuille de présence à tenir.";
  return {
    filters: scopeLabels(scope),
    events: metric(0, none),
    slots: metric(0, none),
    closedSlots: metric(0, none),
    closedShare: metric(null, none),
    byStatus: metric([], none),
    perEvent: metric([], none),
    truncated: false,
  };
}
