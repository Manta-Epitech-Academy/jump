// ─── Cohort noun (`Event.cohortNoun`) ──────────────────────────────────────
// What a single member of an event's cohort is called across the dev workspace
// ("stagiaire" for a stage de seconde, "participant" for a coding club,
// "collégien" for whatever a campus runs next). This is Jump-owned free-text
// per-event config: the noun is typed in the event config wizard and read
// straight off the column. A per-format default rides along the config template
// the staff start from (the stage template carries "stagiaire"), so nothing has
// to infer the word from what kind of event it is.

const COHORT_NOUNS = {
  STAGIAIRE: 'stagiaire',
  PARTICIPANT: 'participant',
} as const;

/** Neutral fallback when an event names no cohort noun (blank column / legacy). */
const DEFAULT_COHORT_NOUN: string = COHORT_NOUNS.PARTICIPANT;

export interface CohortNounForms {
  /** "stagiaire" / "participant" / "collégien" */
  singular: string;
  /** "stagiaires" / "participants" / "collégiens" */
  plural: string;
  /** Sentence-initial singular: "Stagiaire" / "Participant" */
  Singular: string;
  /** Sentence-initial plural: "Stagiaires" / "Participants" */
  Plural: string;
}

/**
 * Display forms for a stored cohort noun. The single place casing/plural forms
 * live, so any irregular handling is a one-line change here rather than a sweep
 * across every call site.
 *
 * The stored value is lower-cased first, so whatever casing staff typed
 * ("Stagiaire", "STAGIAIRE", "stagiaire") renders identically: French cohort
 * nouns are common nouns, lower-case mid-sentence and only capitalised
 * sentence-initial (the `Singular`/`Plural` forms). Plural is a plain `+s`,
 * except values already ending in -s/-x/-z (invariant) - so a noun mistakenly
 * typed in the plural at least never doubles to "...ss". We do NOT singularise
 * (no safe rule: "souris" -> "souri"), so staff still type the singular. Blank/
 * legacy values fall back to the neutral default.
 */
export function cohortNounForms(
  value: string | null | undefined,
): CohortNounForms {
  const singular = (value?.trim() || DEFAULT_COHORT_NOUN).toLowerCase();
  const plural = /[sxz]$/.test(singular) ? singular : `${singular}s`;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return {
    singular,
    plural,
    Singular: cap(singular),
    Plural: cap(plural),
  };
}

/**
 * The event's display name: the admin-set `publicName` if any, else the raw
 * Salesforce `titre`. The single name used everywhere a human reads the event -
 * staff chrome (page titles, breadcrumbs, switcher) and talent surfaces
 * (dashboard, history, QR sheets) alike. An event configured for talents already
 * carries its own `publicName`; when it doesn't, the SF `titre` is an acceptable
 * fallback - the staff-chosen name is shown ~most of the time anyway.
 */
export function eventDisplayName(e: {
  publicName?: string | null;
  titre: string;
}): string {
  return e.publicName?.trim() || e.titre;
}

/**
 * Effective end of an event's active window: its explicit `endDate`, or the
 * start `date` when none is set (a single-day event). Single source of truth so
 * the talent welcome/feedback surfaces and the admin picker's ongoing/past badge
 * stay in lockstep. A multi-day event carries an explicit `endDate` (set in the
 * config wizard or a planning template); nothing is synthesised from a type.
 */
export function eventWindowEnd(date: Date, endDate: Date | null): Date {
  return endDate ?? date;
}

// ─── Start time-of-day (`Event.startMinutes`) ──────────────────────────────
// Jump-owned wall-clock minutes from local midnight (see schema). These pure
// helpers convert to/from the "HH:MM" form the time picker and form use; the
// tz-aware composition into a real instant lives server-side (eventTime.ts).

/**
 * Canonical "HH:MM" 24-hour pattern: the single source shared by the parser
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

/** Default start time (10:00) shown until a human confirms one. */
const DEFAULT_START_MINUTES = 10 * 60;

/**
 * The time we actually show: the confirmed `startMinutes` if set, else a single
 * default (10:00). So talents never see "00:00" even before staff touch it:
 * `startMinutes === null` means "unconfirmed, showing the default" (staff are
 * nudged to validate), a non-null value means a human set it.
 */
export function effectiveStartMinutes(
  startMinutes: number | null | undefined,
): number {
  return startMinutes ?? DEFAULT_START_MINUTES;
}
