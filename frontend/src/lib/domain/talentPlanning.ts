import { startOfDay } from './calendarWeek';

/**
 * The talent dashboard "Planning à venir" widget renders exactly one of three
 * states. Rather than have the component re-derive that state from a ladder of
 * raw-participation truthiness checks (`activeParticipation ? … : upcoming ?
 * …`), the server collapses it into this single discriminated view-model. The
 * widget then branches on one value with no DB-row shapes leaking into the UI,
 * and the dev preview tooling can substitute a view-model wholesale (see
 * {@link readPlanningPreview}) the same way the dev space substitutes a phase
 * status enum.
 */
export type PlanningView =
  | {
      /** Talent is inside an event whose date range covers today. */
      state: 'ongoing';
      titre: string;
      /** Admin-set friendly name; talent-facing copy prefers it over `titre`. */
      publicName: string | null;
    }
  | {
      /** No active event, but a future one is scheduled. */
      state: 'upcoming';
      titre: string;
      publicName: string | null;
      date: Date;
      /** Confirmed wall-clock start, or null when staff haven't set one. */
      startMinutes: number | null;
    }
  | {
      /** Nothing on the horizon. */
      state: 'none';
    };

/**
 * Minimal participation shape the view-model needs. Both the live Prisma query
 * (narrowed `select`) and the dev preview synthesize this, so neither has to
 * carry a full `Event` row.
 */
export type PlanningParticipation = {
  event: {
    titre: string;
    publicName: string | null;
    date: Date;
    startMinutes: number | null;
  } | null;
} | null;

/**
 * Fold the active/upcoming participations into the widget's view-model.
 * Mirrors the load's precedence: an event covering today wins over a future
 * one, and both over the rest state.
 */
export function toPlanningView(
  active: PlanningParticipation,
  upcoming: PlanningParticipation,
): PlanningView {
  if (active?.event) {
    return {
      state: 'ongoing',
      titre: active.event.titre,
      publicName: active.event.publicName,
    };
  }
  if (upcoming?.event) {
    return {
      state: 'upcoming',
      titre: upcoming.event.titre,
      publicName: upcoming.event.publicName,
      date: upcoming.event.date,
      startMinutes: upcoming.event.startMinutes,
    };
  }
  return { state: 'none' };
}

/**
 * The full talent calendar (route `(talent)/calendar`) is no longer scoped to a
 * single event: it lays every activity of every event the talent participates in
 * onto one continuous week-grid. As with {@link toPlanningView}, the server folds
 * the nested Participation → Event → Planning → TimeSlot → Activity rows into a
 * flat view-model so the grid component branches on plain slots with no DB-row
 * shapes leaking into it.
 */
export type CalendarParticipation = {
  event: {
    id: string;
    titre: string;
    date: Date;
    endDate: Date | null;
    planningSlots: Array<{
      id: string;
      startTime: Date;
      endTime: Date;
      nom: string;
      activityType: string;
    }>;
  };
};

/**
 * One placeable slot, tagged with just enough of its parent event (its identity
 * + display name) to label which event it belongs to, with no
 * Participation/Planning shape attached.
 */
export type CalendarSlot = {
  id: string;
  startTime: Date;
  endTime: Date;
  nom: string;
  activityType: string;
  event: { id: string; titre: string };
};

/**
 * The flattened event-tagged slots plus the overall date range spanning every
 * event. `range` is null when the talent has no events at all, which the grid
 * renders as an empty calendar rather than navigating an empty span.
 */
export type CalendarPlanning = {
  slots: CalendarSlot[];
  range: { start: Date; end: Date } | null;
};

/**
 * Flatten every participation's slots into one event-tagged, start-sorted list
 * and compute the overall date range. The range is derived from the events' own
 * [date, endDate] spans (not the slots) so a multi-day event's activity-free
 * edge days still count as in-range on the grid.
 */
export function toCalendarPlanning(
  participations: CalendarParticipation[],
): CalendarPlanning {
  const slots: CalendarSlot[] = [];
  let start: Date | null = null;
  let end: Date | null = null;

  for (const { event } of participations) {
    const eventStart = startOfDay(event.date);
    const eventEnd = startOfDay(event.endDate ?? event.date);
    if (!start || eventStart < start) start = eventStart;
    if (!end || eventEnd > end) end = eventEnd;

    for (const slot of event.planningSlots) {
      slots.push({
        id: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        nom: slot.nom,
        activityType: slot.activityType,
        event: {
          id: event.id,
          titre: event.titre,
        },
      });
    }
  }

  slots.sort((a, b) => {
    const sa = new Date(a.startTime).getTime();
    const sb = new Date(b.startTime).getTime();
    if (sa !== sb) return sa - sb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return { slots, range: start && end ? { start, end } : null };
}
