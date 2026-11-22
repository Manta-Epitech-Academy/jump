import { eventDayKeys } from './campusCalendar';
import { eventPublicName, UNNAMED_EVENT_NAME } from './event';
import type { DateKey } from './planningTime';

/**
 * The full talent calendar (route `(talent)/calendar`) is no longer scoped to a
 * single event: it lays every activity of every event the talent participates in
 * onto one continuous week-grid. The server folds
 * the nested Participation → Event → Planning_Slot rows into a flat, event-tagged
 * view-model so the grid component branches on plain slots with no DB-row shapes
 * leaking into it.
 */
export type CalendarParticipation = {
  event: {
    id: string;
    publicName: string | null;
    date: Date;
    endDate: Date | null;
    campus: { timezone: string };
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
 * Participation/Planning shape attached. The name is the event's public one,
 * never its Salesforce title, as everywhere a talent reads (`eventPublicName`).
 * The timezone is its campus's, the clock its hours are announced on.
 */
export type CalendarSlot = {
  id: string;
  startTime: Date;
  endTime: Date;
  nom: string;
  activityType: string;
  event: { id: string; name: string; timezone: string };
};

/**
 * The flattened event-tagged slots plus the grid they are laid on: the first
 * and last campus day the week may page across, and the campus clock the grid
 * reads. `grid` is null when the talent has no events at all, which the page
 * renders as an empty calendar rather than navigating an empty span.
 *
 * Each event's days are read on its own campus clock, so an event that starts
 * at Réunion midnight starts on its Réunion day, never on the evening before
 * in Paris (where the pods run) or wherever the talent's browser is.
 *
 * A grid has one clock, and it is the campus of the event closest to `now`,
 * the one the grid opens on. A talent's events are on one campus in practice;
 * the rule only decides the case where they are not.
 */
export type CalendarPlanning = {
  slots: CalendarSlot[];
  grid: { start: DateKey; end: DateKey; timezone: string } | null;
};

/** How far an event is from `now`: zero while it runs. */
function distanceFromNow(
  event: { date: Date; endDate: Date | null },
  now: Date,
): number {
  const end = event.endDate ?? event.date;
  if (now < event.date) return event.date.getTime() - now.getTime();
  if (now > end) return now.getTime() - end.getTime();
  return 0;
}

/**
 * Flatten every participation's slots into one event-tagged, start-sorted list
 * and compute the grid. The range is derived from the events' own
 * [date, endDate] spans (not the slots) so a multi-day event's activity-free
 * edge days still count as in-range on the grid.
 */
export function toCalendarPlanning(
  participations: CalendarParticipation[],
  now: Date,
): CalendarPlanning {
  const slots: CalendarSlot[] = [];
  let start: DateKey | null = null;
  let end: DateKey | null = null;
  let closest: { timezone: string; distance: number } | null = null;

  for (const { event } of participations) {
    const timezone = event.campus.timezone;
    const days = eventDayKeys(event.date, event.endDate, timezone);
    if (!start || days.first < start) start = days.first;
    if (!end || days.last > end) end = days.last;
    const distance = distanceFromNow(event, now);
    if (!closest || distance < closest.distance) {
      closest = { timezone, distance };
    }

    for (const slot of event.planningSlots) {
      slots.push({
        id: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        nom: slot.nom,
        activityType: slot.activityType,
        event: {
          id: event.id,
          name: eventPublicName(event) ?? UNNAMED_EVENT_NAME,
          timezone,
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

  return {
    slots,
    grid:
      start && end && closest
        ? { start, end, timezone: closest.timezone }
        : null,
  };
}
