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
 * Human label for a raw `Event.eventType` string (Prisma types it as `string`),
 * falling back to the raw value for any unknown type. Use this for talent-facing
 * copy and QR sheets so the per-event `titre` (cohort dates/suffixes) never leaks.
 */
export function eventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType as EventType] ?? eventType;
}

/**
 * Staff/admin chrome name: the admin-set `publicName` if any, else the raw
 * Salesforce `titre`. Staff can read the SF identifier, so the fallback keeps
 * the event recognisable. Use in dev page titles, breadcrumbs and the switcher.
 */
export function eventDisplayName(e: {
  publicName?: string | null;
  titre: string;
}): string {
  return e.publicName?.trim() || e.titre;
}

/**
 * Talent-facing name: the admin-set `publicName` if any, else the friendly type
 * label ("Stage de Seconde", "Coding Club"). Never falls back to `titre` so the
 * ugly SF campaign name can't leak to students (QR sheets, dashboard widget).
 */
export function eventPublicName(e: {
  publicName?: string | null;
  eventType: string;
}): string {
  return e.publicName?.trim() || eventTypeLabel(e.eventType);
}

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

// ─── Start time-of-day (`Event.startMinutes`) ──────────────────────────────
// Jump-owned wall-clock minutes from local midnight (see schema). These pure
// helpers convert to/from the "HH:MM" form the time picker and form use; the
// tz-aware composition into a real instant lives server-side (eventTime.ts).

/**
 * Canonical "HH:MM" 24-hour pattern — the single source shared by the parser
 * below and the Zod form schema, so the two can never drift. Capturing groups
 * are used by `hhmmToMinutes`; a `.test()` ignores them.
 */
export const HHMM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `600` → `"10:00"`. `null`/out-of-range → `""` (no time set). */
export function minutesToHHMM(minutes: number | null | undefined): string {
  if (minutes == null || minutes < 0 || minutes > 1439) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `"10:00"` → `600`. Empty/invalid → `null` (clears the time). */
export function hhmmToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = HHMM_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Sensible default start time per event type, used until a human confirms one.
 * Stages open mid-morning (10:00); coding clubs run after class (14:00).
 */
export const DEFAULT_START_MINUTES: Record<EventType, number> = {
  [EVENT_TYPES.STAGE_SECONDE]: 10 * 60,
  [EVENT_TYPES.CODING_CLUB]: 14 * 60,
};

/**
 * The time we actually show: the confirmed `startMinutes` if set, else the
 * type default. So talents never see "00:00" even before staff touch it —
 * `startMinutes === null` means "unconfirmed, showing the default" (staff are
 * nudged to validate), a non-null value means a human set it.
 */
export function effectiveStartMinutes(
  eventType: string,
  startMinutes: number | null | undefined,
): number {
  if (startMinutes != null) return startMinutes;
  return DEFAULT_START_MINUTES[eventType as EventType] ?? 10 * 60;
}
