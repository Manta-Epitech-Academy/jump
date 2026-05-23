export const EVENT_TYPES = {
  CODING_CLUB: 'coding_club',
  STAGE_SECONDE: 'stage_seconde',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export const EVENT_TYPE_VALUES = Object.values(EVENT_TYPES) as EventType[];

/**
 * Display label for the Stage de Seconde across the dev space. Surfaced
 * instead of the per-event `titre` field so cohort identifiers (dates,
 * suffixes) don't leak into page titles, breadcrumbs and hero headings.
 */
export const STAGE_SECONDE_LABEL = 'Stage de Seconde';

/**
 * Human label per event type, for talent-facing copy where the per-event
 * `titre` (which carries cohort dates/suffixes) would be noise.
 */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  [EVENT_TYPES.STAGE_SECONDE]: STAGE_SECONDE_LABEL,
  [EVENT_TYPES.CODING_CLUB]: 'Coding Club',
};

/**
 * Whether an event type carries a transversal theme. Allow-list: a stage
 * cohort has no single theme (activities span many), only year-round
 * coding-club sessions do. New event types default to no-theme until they
 * explicitly opt in here.
 */
export function eventTypeHasTheme(type: string): boolean {
  return type === EVENT_TYPES.CODING_CLUB;
}
