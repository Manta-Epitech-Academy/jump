/**
 * The callable for the one-shot Salesforce attendance back-fill: `applyPresence`.
 *
 * Salesforce holds the truth for who attended which past event, but the worker
 * sync cannot carry it (it is not on the polled payload), so this back-fills it
 * once. The unit of SF data is one row per (event, talent, present?): a talent
 * either showed up to an event or did not. Both ids resolve through the
 * external-id columns Jump already keeps (`Event.externalId` / `Talent.externalId`,
 * both @unique) because Salesforce has no Jump talent id, only its own external
 * id. Each fact writes one émargement cell, tagged `source: 'system'` so it is
 * visibly an import, never confused with a staff `manual` mark or a QR
 * self-check-in. The point is the talent fiche history feed (TekCamp-style): a
 * past event reads "Présent" or "Absent" forever after.
 *
 * This is the only thing you need to call. Drive it from whatever id source you
 * land on (the SF dump, an extId join, a hand-built list); a ready-made CSV
 * driver over it lives in `import-sf-presence.ts`, but ignore that file if you
 * write your own loop:
 *
 *   import { applyPresence, makePrisma } from './sf-presence';
 *   const prisma = makePrisma();
 *   try {
 *     for (const row of myRows) {
 *       const res = await applyPresence(prisma, {
 *         eventExternalId: row.campaignExtId,
 *         talentExternalId: row.contactExtId,
 *         present: row.attended,
 *       });
 *       if (!res.ok) console.warn(res.reason, res.detail);
 *     }
 *   } finally {
 *     await prisma.$disconnect();
 *   }
 *
 * Deliberately self-contained (no `$lib` imports): like the other scripts it must
 * run against the production image, where the Vite `$lib` alias does not resolve.
 * The date/slot helpers below are inlined from `src/lib/domain/eventPresence.ts`
 * and must stay in sync by inspection so an imported day lands on the same
 * créneau the émargement grid renders.
 */

import path from 'node:path';
import dotenv from 'dotenv';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ── Domain types (mirror the Prisma enums) ───────────────────────────────────

export type PresenceSlot = 'morning' | 'afternoon';
export type PresenceStatus = 'present' | 'late' | 'absent' | 'excused';

const DEFAULT_TIMEZONE = 'Europe/Paris';
const STAGE_SECONDE = 'stage_seconde';
const STAGE_PRESENCE_WORKDAYS = 10; // Mon-Fri x 2 weeks, see domain/eventPresence.ts
/** Minute-of-day boundary: an event starting before noon is a morning créneau. */
const MORNING_END_MINUTES = 12 * 60;

// ── Day math (inlined from src/lib/domain/eventPresence.ts) ───────────────────

type DateKey = string; // 'YYYY-MM-DD', timezone-free

function toDateKey(instant: Date, timezone: string): DateKey {
  return instant.toLocaleDateString('en-CA', { timeZone: timezone });
}

function dateKeyToDbDate(key: DateKey): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function dbDateToKey(value: Date): DateKey {
  return value.toISOString().slice(0, 10);
}

function isWorkday(key: DateKey): boolean {
  const dow = dateKeyToDbDate(key).getUTCDay(); // 0 Sun ... 6 Sat
  return dow !== 0 && dow !== 6;
}

function eventDays(
  event: { date: Date; endDate: Date | null },
  timezone: string,
  opts: { workdaysOnly?: boolean } = {},
): DateKey[] {
  const start = toDateKey(event.date, timezone);
  const end = toDateKey(event.endDate ?? event.date, timezone);
  const days: DateKey[] = [];
  const cursor = dateKeyToDbDate(start);
  const last = dateKeyToDbDate(end);
  while (cursor.getTime() <= last.getTime()) {
    const key = dbDateToKey(cursor);
    if (!opts.workdaysOnly || isWorkday(key)) days.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function workdaysFrom(startKey: DateKey, count: number): DateKey[] {
  const days: DateKey[] = [];
  const cursor = dateKeyToDbDate(startKey);
  while (days.length < count) {
    const key = dbDateToKey(cursor);
    if (isWorkday(key)) days.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function presenceDays(
  event: { date: Date; endDate: Date | null; eventType: string },
  timezone: string,
): DateKey[] {
  if (event.eventType !== STAGE_SECONDE) {
    return eventDays(event, timezone);
  }
  if (event.endDate) {
    return eventDays(event, timezone, { workdaysOnly: true });
  }
  return workdaysFrom(toDateKey(event.date, timezone), STAGE_PRESENCE_WORKDAYS);
}

/**
 * Which half-day an imported event lands on when the caller does not say.
 * Salesforce often has no time for a coding club, so the default is the
 * afternoon (per the team decision); when Jump has a wall-clock start
 * (`startMinutes`), an AM start is a morning créneau, anything else afternoon.
 */
function resolveImportSlot(event: {
  startMinutes: number | null;
}): PresenceSlot {
  if (event.startMinutes == null) return 'afternoon';
  return event.startMinutes < MORNING_END_MINUTES ? 'morning' : 'afternoon';
}

// ── The callable ──────────────────────────────────────────────────────────

/** A single SF attendance fact: a talent was (not) at an event. */
export interface PresenceImportInput {
  /** Salesforce id of the event (matched against `Event.externalId`). */
  eventExternalId: string;
  /** Salesforce id of the talent (matched against `Talent.externalId`). */
  talentExternalId: string;
  /** true -> 'present', false -> 'absent' (unless `status` overrides). */
  present: boolean;
  /** Override the day. Defaults to the event's start day in the campus timezone. */
  day?: DateKey;
  /** Override the créneau. Defaults to `resolveImportSlot(event)`. */
  slot?: PresenceSlot;
  /** Override the status (e.g. 'late' / 'excused'). Else derived from `present`. */
  status?: PresenceStatus;
}

export type ApplyOutcome =
  | {
      ok: true;
      action: 'created' | 'updated' | 'unchanged';
      eventId: string;
      talentId: string;
      day: DateKey;
      slot: PresenceSlot;
      status: PresenceStatus;
    }
  | {
      ok: false;
      reason: 'event_not_found' | 'talent_not_found' | 'day_out_of_window';
      detail: string;
    };

/**
 * Resolve a (event extId, talent extId, present) fact to one `EventPresence`
 * cell and upsert it. Pure of any request context, so it runs the same from a
 * script, a transaction, or a future admin endpoint. Passing the client in
 * (rather than importing the `$lib` singleton) is what lets this file run in the
 * production image; wrap the call in `prisma.$transaction` if you batch.
 */
export async function applyPresence(
  db: PrismaClient,
  input: PresenceImportInput,
  opts: { dryRun?: boolean } = {},
): Promise<ApplyOutcome> {
  const event = await db.event.findUnique({
    where: { externalId: input.eventExternalId },
    select: {
      id: true,
      date: true,
      endDate: true,
      eventType: true,
      startMinutes: true,
      campus: { select: { timezone: true } },
    },
  });
  if (!event) {
    return {
      ok: false,
      reason: 'event_not_found',
      detail: `Event.externalId=${input.eventExternalId}`,
    };
  }

  const talent = await db.talent.findUnique({
    where: { externalId: input.talentExternalId },
    select: { id: true },
  });
  if (!talent) {
    return {
      ok: false,
      reason: 'talent_not_found',
      detail: `Talent.externalId=${input.talentExternalId}`,
    };
  }

  const timezone = event.campus?.timezone ?? DEFAULT_TIMEZONE;
  const day = input.day ?? toDateKey(event.date, timezone);
  const slot = input.slot ?? resolveImportSlot(event);
  const status: PresenceStatus =
    input.status ?? (input.present ? 'present' : 'absent');

  // A day outside the émargement window would write a row no grid ever renders:
  // silently invisible. Refuse it so a bad CSV day is a reported skip, not a leak.
  const windowDays = presenceDays(event, timezone);
  if (!windowDays.includes(day)) {
    return {
      ok: false,
      reason: 'day_out_of_window',
      detail: `day ${day} not in [${windowDays[0]} .. ${windowDays[windowDays.length - 1]}]`,
    };
  }

  const dbDay = dateKeyToDbDate(day);
  const where = {
    talentId_eventId_day_slot: {
      talentId: talent.id,
      eventId: event.id,
      day: dbDay,
      slot,
    },
  } as const;

  const existing = await db.eventPresence.findUnique({
    where,
    select: { status: true, source: true },
  });

  const base = {
    eventId: event.id,
    talentId: talent.id,
    day,
    slot,
    status,
  } as const;

  if (existing && existing.status === status && existing.source === 'system') {
    return { ok: true, action: 'unchanged', ...base };
  }

  if (!opts.dryRun) {
    await db.eventPresence.upsert({
      where,
      create: {
        talentId: talent.id,
        eventId: event.id,
        day: dbDay,
        slot,
        status,
        source: 'system',
        markedAt: new Date(),
      },
      update: { status, source: 'system', markedAt: new Date() },
    });
  }

  return { ok: true, action: existing ? 'updated' : 'created', ...base };
}

// ── Standalone Prisma helper ────────────────────────────────────────────────

let envLoaded = false;

/** Load the repo-root `.env` once, the same path the other scripts use. */
export function loadEnv(): void {
  if (envLoaded) return;
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  envLoaded = true;
}

/**
 * Build a standalone Prisma client for a script run (loads `.env` first).
 * Remember to `await prisma.$disconnect()` when done.
 */
export function makePrisma(): PrismaClient {
  loadEnv();
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
}
