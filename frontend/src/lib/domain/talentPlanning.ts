import { eventPublicName, UNNAMED_EVENT_NAME } from './event';

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
 */
export type CalendarSlot = {
  id: string;
  startTime: Date;
  endTime: Date;
  nom: string;
  activityType: string;
  event: { id: string; name: string };
};

/**
 * The flattened event-tagged slots plus the overall date range spanning every
 * event. `range` is null when the talent has no events at all, which the grid
 * renders as an empty calendar rather than navigating an empty span.
 *
 * The bounds are the stored instants, not days: the grid lays everything out
 * on the viewer's clock, so `WeekNavigator` takes the day of each bound there.
 * Taking it here took it on the server's clock instead, and an event stored at
 * Réunion midnight is the evening before in Paris, where the pods run.
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
    const eventEnd = event.endDate ?? event.date;
    if (!start || event.date < start) start = event.date;
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
          name: eventPublicName(event) ?? UNNAMED_EVENT_NAME,
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
