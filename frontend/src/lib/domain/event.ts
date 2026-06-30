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

// ─── Cohort noun (`Event.cohortNoun`) ──────────────────────────────────────
// What a single member of an event's cohort is called across the dev workspace
// ("stagiaire" for a stage de seconde, "participant" for anything else). This is
// Jump-owned per-event config, NOT derived from `eventType`: the SF type is only
// a hint (it can be mis-entered, and we can't fix it), so the noun is set in the
// event config wizard and read straight off the column. `suggestedCohortNoun`
// turns the SF type into the wizard's default selection, the ONLY place the type
// touches the noun.

export const COHORT_NOUNS = {
  STAGIAIRE: 'stagiaire',
  PARTICIPANT: 'participant',
} as const;

export type CohortNoun = (typeof COHORT_NOUNS)[keyof typeof COHORT_NOUNS];

export const COHORT_NOUN_VALUES = Object.values(COHORT_NOUNS) as CohortNoun[];

/** Neutral default: a freshly imported event names its cohort "participant". */
export const DEFAULT_COHORT_NOUN: CohortNoun = COHORT_NOUNS.PARTICIPANT;

export interface CohortNounForms {
  /** "stagiaire" / "participant" */
  singular: string;
  /** "stagiaires" / "participants" */
  plural: string;
  /** Sentence-initial singular: "Stagiaire" / "Participant" */
  Singular: string;
  /** Sentence-initial plural: "Stagiaires" / "Participants" */
  Plural: string;
}

/**
 * Display forms for a stored cohort noun. The single place plural/capitalised
 * forms live, so a future irregular noun is a one-line change here rather than a
 * sweep across every call site. Both current nouns pluralise with a plain `+s`.
 * Unknown/legacy values fall back to the neutral default.
 */
export function cohortNounForms(
  value: string | null | undefined,
): CohortNounForms {
  const singular =
    value === COHORT_NOUNS.STAGIAIRE
      ? COHORT_NOUNS.STAGIAIRE
      : DEFAULT_COHORT_NOUN;
  const plural = `${singular}s`;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return {
    singular,
    plural,
    Singular: cap(singular),
    Plural: cap(plural),
  };
}

/**
 * The wizard's suggested cohort noun for an event's SF type. Used ONLY to
 * pre-select the config control on a never-configured event; never read at
 * render (the persisted column is the truth everywhere else).
 */
export function suggestedCohortNoun(eventType: string): CohortNoun {
  return eventType === EVENT_TYPES.STAGE_SECONDE
    ? COHORT_NOUNS.STAGIAIRE
    : COHORT_NOUNS.PARTICIPANT;
}

/**
 * The event's display name: the admin-set `publicName` if any, else the raw
 * Salesforce `titre`. The single name used everywhere a human reads the event -
 * staff chrome (page titles, breadcrumbs, switcher) and talent surfaces
 * (dashboard, history, QR sheets) alike.
 *
 * The talent name deliberately no longer derives from `eventType`: the SF type
 * is a hint, never a binding (a campaign miswired as the wrong type must not
 * drive the label), and an event configured for talents already carries its own
 * `publicName`. When it doesn't, the SF `titre` is an acceptable fallback - the
 * staff-chosen name is shown ~most of the time anyway.
 */
export function eventDisplayName(e: {
  publicName?: string | null;
  titre: string;
}): string {
  return e.publicName?.trim() || e.titre;
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
