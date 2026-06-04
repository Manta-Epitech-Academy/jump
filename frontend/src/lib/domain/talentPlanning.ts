import type { EventType } from './event';

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
      eventType: EventType;
      titre: string;
    }
  | {
      /** No active event, but a future one is scheduled. */
      state: 'upcoming';
      eventType: EventType;
      titre: string;
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
    eventType: string;
    titre: string;
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
      eventType: active.event.eventType as EventType,
      titre: active.event.titre,
    };
  }
  if (upcoming?.event) {
    return {
      state: 'upcoming',
      eventType: upcoming.event.eventType as EventType,
      titre: upcoming.event.titre,
      date: upcoming.event.date,
      startMinutes: upcoming.event.startMinutes,
    };
  }
  return { state: 'none' };
}
