/**
 * Pure helpers for the administrative émargement (attendance) of an event.
 *
 * A talent's attendance is tracked per half-day: one cell per (event day,
 * morning|afternoon). The single source of truth is the `EventPresence` table;
 * a missing row means the cell is still "en attente" (not handled yet), which
 * is why the cell status here is a four-value DB enum widened with a synthetic
 * `pending`. No Svelte, no Prisma, no DOM: dates and projections only, so this
 * runs identically on the server load and in the browser during polling.
 *
 * Days are carried as `YYYY-MM-DD` keys. The campus timezone is applied once,
 * server-side, to turn an event's instant range into calendar days; everything
 * downstream is a plain calendar date with no timezone, matching the `@db.Date`
 * column (which Prisma round-trips as a UTC-midnight Date).
 */

import { EVENT_TYPES } from '$lib/domain/event';

export type PresenceSlot = 'morning' | 'afternoon';
export type PresenceStatus = 'present' | 'late' | 'absent' | 'excused';
export type PresenceSource = 'qr' | 'manual' | 'system';
/** DB status widened with the "no row yet" state the table represents implicitly. */
export type CellStatus = PresenceStatus | 'pending';

/** A calendar day, `YYYY-MM-DD`, timezone-free. */
export type DateKey = string;

export const PRESENCE_SLOTS: readonly PresenceSlot[] = ['morning', 'afternoon'];

export function slotLabelFr(slot: PresenceSlot): string {
  return slot === 'morning' ? 'Matin' : 'Après-midi';
}

const STATUS_LABELS: Record<CellStatus, string> = {
  pending: 'En attente',
  present: 'Présent',
  late: 'En retard',
  absent: 'Absent',
  excused: 'Justifié',
};

export function statusLabelFr(status: CellStatus): string {
  return STATUS_LABELS[status];
}

/** Badge classes per status, light + dark, matching the staff datatable tone. */
const STATUS_TONES: Record<CellStatus, string> = {
  pending: 'bg-muted text-muted-foreground border-transparent',
  present:
    'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25',
  late: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25',
  absent:
    'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/25',
  excused:
    'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/25',
};

export function statusTone(status: CellStatus): string {
  return STATUS_TONES[status];
}

// ── Day math ────────────────────────────────────────────────────────────────

/** The calendar day of an instant in a given IANA timezone, as `YYYY-MM-DD`. */
export function toDateKey(instant: Date, timezone: string): DateKey {
  // en-CA formats as YYYY-MM-DD, which is exactly the key shape we want.
  return instant.toLocaleDateString('en-CA', { timeZone: timezone });
}

/** A `@db.Date` value (UTC midnight) for the given calendar day. */
export function dateKeyToDbDate(key: DateKey): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * Decompose a `YYYY-MM-DD` key into its numeric calendar parts. Use this (not a
 * `Date`) to feed a wall-clock-in-timezone calculation: a key is a bare calendar
 * day, so its parts carry no timezone to be lost or misread.
 */
export function dateKeyParts(key: DateKey): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/** Recover the calendar day from a `@db.Date` value Prisma read back. */
export function dbDateToKey(value: Date): DateKey {
  return value.toISOString().slice(0, 10);
}

/** Monday-Friday. Weekends are excluded from stage de seconde créneaux. */
export function isWorkday(key: DateKey): boolean {
  const dow = dateKeyToDbDate(key).getUTCDay(); // 0 Sun ... 6 Sat
  return dow !== 0 && dow !== 6;
}

/**
 * The inclusive list of calendar days an event spans, in the campus timezone.
 * Single-day events (no `endDate`) yield one day. With `workdaysOnly` (stage de
 * seconde runs Monday-Friday) the weekends are dropped, so a 2-week stage yields
 * 10 days, not 14.
 */
export function eventDays(
  event: { date: Date; endDate: Date | null },
  timezone: string,
  opts: { workdaysOnly?: boolean } = {},
): DateKey[] {
  const start = toDateKey(event.date, timezone);
  const end = toDateKey(event.endDate ?? event.date, timezone);
  const days: DateKey[] = [];
  // Iterate in UTC to sidestep DST: each step is exactly 24h on a UTC-midnight date.
  const cursor = dateKeyToDbDate(start);
  const last = dateKeyToDbDate(end);
  while (cursor.getTime() <= last.getTime()) {
    const key = dbDateToKey(cursor);
    if (!opts.workdaysOnly || isWorkday(key)) days.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** One émargement créneau: a (day, half-day) pair, the unit staff pick to pointer. */
export interface EventSlot {
  day: DateKey;
  slot: PresenceSlot;
  /** `${day}|${slot}`, the stable id used by the selector. */
  key: string;
}

export function slotKey(day: DateKey, slot: PresenceSlot): string {
  return `${day}|${slot}`;
}

/** The ordered list of créneaux (≈20 over a 2-week stage): each working day × 2. */
export function eventSlots(
  event: { date: Date; endDate: Date | null },
  timezone: string,
  opts: { workdaysOnly?: boolean } = {},
): EventSlot[] {
  return eventDays(event, timezone, opts).flatMap((day) =>
    PRESENCE_SLOTS.map((slot) => ({ day, slot, key: slotKey(day, slot) })),
  );
}

/**
 * Canonical shape of a Stage de Seconde for émargement: two working weeks,
 * Monday-Friday twice, i.e. 10 working days (20 half-day créneaux). It is a
 * domain invariant of the stage, not a per-event field, so the grid can exist
 * in full before anyone fills `endDate` or populates the planning.
 */
export const STAGE_PRESENCE_WEEKS = 2;
export const STAGE_PRESENCE_WORKDAYS = STAGE_PRESENCE_WEEKS * 5; // Mon-Fri × 2

/** The first `count` working days from a start key (inclusive), weekends skipped. */
function workdaysFrom(startKey: DateKey, count: number): DateKey[] {
  const days: DateKey[] = [];
  // Iterate in UTC like `eventDays`: each step is exactly 24h on a UTC-midnight date.
  const cursor = dateKeyToDbDate(startKey);
  while (days.length < count) {
    const key = dbDateToKey(cursor);
    if (isWorkday(key)) days.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * The calendar days émargement covers for an event. The single source of truth
 * for the créneau grid, the XLSX export and the QR check-in day validation, so
 * the three can never disagree on which day belongs to the event.
 *
 * Decoupled from the planning: a Stage de Seconde always yields its full window
 * even with an empty planning. When `endDate` is set a human picked the span, so
 * it wins (working days only); when it isn't (the common case — staff rarely
 * fill it and Salesforce never does) the window defaults to the canonical two
 * working weeks. This default is distinct from `stageWindowEnd` (event.ts) on
 * purpose: that one answers "is the stage still running?" for talent messaging
 * and is deliberately generous (`date + 14` calendar days), whereas this needs
 * the exact créneaux to émarger, no phantom trailing day.
 */
export function presenceDays(
  event: { date: Date; endDate: Date | null; eventType: string },
  timezone: string,
): DateKey[] {
  if (event.eventType !== EVENT_TYPES.STAGE_SECONDE) {
    // Coding clubs and other types: their own calendar window, all days.
    return eventDays(event, timezone);
  }
  if (event.endDate) {
    return eventDays(event, timezone, { workdaysOnly: true });
  }
  return workdaysFrom(toDateKey(event.date, timezone), STAGE_PRESENCE_WORKDAYS);
}

/**
 * Day index + total for the "J{n}/{total}" stage countdown, counting **working
 * days only** (a Stage de Seconde runs Monday-Friday twice = 10 days, never 12
 * or 14). Shares `presenceDays` so the countdown, the émargement grid and the
 * XLSX export can never disagree on the stage shape. `dayN` is today's position
 * in that window (the count of working days elapsed through today, clamped into
 * [1, total]); on a weekend mid-stage it holds the last working day reached.
 */
export function stageCountdown(
  event: { date: Date; endDate: Date | null; eventType: string },
  timezone: string,
  now: Date,
): { dayN: number; totalDays: number } {
  const days = presenceDays(event, timezone);
  const totalDays = Math.max(1, days.length);
  const todayKey = toDateKey(now, timezone);
  const elapsed = days.filter((day) => day <= todayKey).length;
  const dayN = Math.min(totalDays, Math.max(1, elapsed));
  return { dayN, totalDays };
}

/** The ordered list of émargement créneaux (each `presenceDays` day × morning/afternoon). */
export function presenceSlots(
  event: { date: Date; endDate: Date | null; eventType: string },
  timezone: string,
): EventSlot[] {
  return presenceDays(event, timezone).flatMap((day) =>
    PRESENCE_SLOTS.map((slot) => ({ day, slot, key: slotKey(day, slot) })),
  );
}

/** "lun. 9 juin · Matin" for the créneau selector. */
export function slotLabelLong(s: EventSlot): string {
  return `${dayShortLabelFr(s.day)} · ${slotLabelFr(s.slot)}`;
}

/**
 * The créneau to land on when opening the page: today's half-day by the clock
 * when the stage is running, otherwise the next upcoming créneau, falling back to
 * the last one once the stage is over.
 */
export function defaultActiveSlotKey(
  slots: EventSlot[],
  todayKey: DateKey,
  nowHour: number,
): string {
  if (slots.length === 0) return '';
  const wanted: PresenceSlot = nowHour < 13 ? 'morning' : 'afternoon';
  const todayExact = slots.find((s) => s.day === todayKey && s.slot === wanted);
  if (todayExact) return todayExact.key;
  const todayAny = slots.find((s) => s.day === todayKey);
  if (todayAny) return todayAny.key;
  // Today carries no créneau of its own: before the stage, after it, or a weekend
  // (or gap) in the middle. Land on the next créneau on or after today, and only
  // fall back to the last one when the whole stage is already past. (Before this,
  // any non-créneau day past the start jumped to the last day — a Sunday mid-stage
  // opened on the final Friday.)
  const upcoming = slots.find((s) => s.day >= todayKey);
  return upcoming ? upcoming.key : slots[slots.length - 1].key;
}

/** "lundi 9 juin" for a day tab / navigator label. */
export function dayLabelFr(key: DateKey): string {
  return dateKeyToDbDate(key).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** "lun. 9 juin" compact variant. */
export function dayShortLabelFr(key: DateKey): string {
  return dateKeyToDbDate(key).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

// ── Projection + stats ────────────────────────────────────────────────────

/** A single (talent, day, slot) attendance cell projected for display. */
export interface PresenceCell {
  status: CellStatus;
  source: PresenceSource | null;
}

export const PENDING_CELL: PresenceCell = {
  status: 'pending',
  source: null,
};

/** Minimal shape of a stored presence row needed to project cells. */
export interface PresenceRecord {
  talentId: string;
  day: DateKey;
  slot: PresenceSlot;
  status: PresenceStatus;
  source: PresenceSource;
}

function cellKey(talentId: string, day: DateKey, slot: PresenceSlot) {
  return `${talentId}|${day}|${slot}`;
}

/**
 * Index presence records by (talent, day, slot) for O(1) cell lookup.
 * Use `cellOf` against the returned map; absent entries are PENDING_CELL.
 */
export function indexPresences(
  records: PresenceRecord[],
): Map<string, PresenceCell> {
  const map = new Map<string, PresenceCell>();
  for (const r of records) {
    map.set(cellKey(r.talentId, r.day, r.slot), {
      status: r.status,
      source: r.source,
    });
  }
  return map;
}

export function cellOf(
  index: Map<string, PresenceCell>,
  talentId: string,
  day: DateKey,
  slot: PresenceSlot,
): PresenceCell {
  return index.get(cellKey(talentId, day, slot)) ?? PENDING_CELL;
}

/**
 * Project a cell's displayed status. A still-unmarked talent ("pending") in a
 * CLOSED créneau reads as absent: absence is derived from closure (manual close
 * or the 11h/15h cutoff having passed), never stored as a row. Any stored status
 * (present/late/excused, or a manual absent) wins as-is.
 */
export function effectiveStatus(
  stored: CellStatus,
  slotClosed: boolean,
): CellStatus {
  return stored === 'pending' && slotClosed ? 'absent' : stored;
}

export interface SlotStats {
  present: number;
  late: number;
  absent: number;
  excused: number;
  pending: number;
  total: number;
  /** Present or late, over total (those physically there). */
  presentPct: number;
  /** Anything but pending, over total (how far the émargement has progressed). */
  handledPct: number;
}

export function emptySlotStats(): SlotStats {
  return {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    pending: 0,
    total: 0,
    presentPct: 0,
    handledPct: 0,
  };
}

/** Tally a list of cell statuses (one slot, all talents) into sidebar counts. */
export function computeSlotStats(statuses: CellStatus[]): SlotStats {
  const s = emptySlotStats();
  s.total = statuses.length;
  for (const status of statuses) s[status] += 1;
  if (s.total > 0) {
    s.presentPct = Math.round(((s.present + s.late) / s.total) * 100);
    s.handledPct = Math.round(((s.total - s.pending) / s.total) * 100);
  }
  return s;
}

/**
 * Attendance rate over the créneaux that have a verdict: present-or-late cells
 * over every DECIDED cell (present/late/absent/excused), ignoring cells still
 * "pending" (open créneaux not yet émargés). Feed it effective statuses (run
 * each cell through `effectiveStatus` first) so a closed créneau's unmarked
 * talents count as absent. Dividing by decided cells, not by every future
 * créneau, keeps the rate meaningful from day one instead of reading ~0% while
 * most slots haven't happened yet. Returns null when nothing is decided yet
 * (caller shows "—").
 */
export function computeAttendanceRate(statuses: CellStatus[]): number | null {
  const decided = statuses.filter((s) => s !== 'pending');
  if (decided.length === 0) return null;
  const present = decided.filter((s) => s === 'present' || s === 'late').length;
  return Math.round((present / decided.length) * 100);
}
