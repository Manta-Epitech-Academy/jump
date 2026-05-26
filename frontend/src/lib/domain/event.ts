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
 * Default span of a Stage de Seconde when an event carries no explicit
 * `endDate`. Seconde internships run ~2 weeks, and we rarely populate
 * `endDate`, so this default is what actually drives "is the stage still
 * running?" almost everywhere.
 */
export const STAGE_DEFAULT_DURATION_DAYS = 14;

/**
 * Effective end of a stage's active window: its explicit `endDate`, or
 * `date + STAGE_DEFAULT_DURATION_DAYS` when none is set. Single source of
 * truth so the talent welcome message (which lives for the whole stage
 * window) and the admin picker's ongoing/past badge stay in lockstep —
 * otherwise a stage with no `endDate` looks "ongoing" to staff while talents
 * already lost the message the day after it started.
 */
export function stageWindowEnd(date: Date, endDate: Date | null): Date {
  if (endDate) return endDate;
  const end = new Date(date);
  end.setDate(end.getDate() + STAGE_DEFAULT_DURATION_DAYS);
  return end;
}

/**
 * Whether an event type carries a transversal theme. Allow-list: a stage
 * cohort has no single theme (activities span many), only year-round
 * coding-club sessions do. New event types default to no-theme until they
 * explicitly opt in here.
 */
export function eventTypeHasTheme(type: string): boolean {
  return type === EVENT_TYPES.CODING_CLUB;
}
