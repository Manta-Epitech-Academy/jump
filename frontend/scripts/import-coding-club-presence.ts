/**
 * CSV driver: coding-club attendance → émargement (both half-days).
 *
 * Feeds the CSV produced by the worker
 * (`jump-sf-worker/src/exportCodingClubPresence.ts`) into the émargement grid.
 * Each CSV row is one (event, talent, present?) fact; a coding club is a single
 * day with a morning and an afternoon créneau, so **each row writes TWO
 * `EventPresence` cells** (one `morning`, one `afternoon`), both carrying the
 * same present/absent status on the event's start day.
 *
 * This differs from the generic `import-sf-presence.ts` driver (which writes one
 * créneau per row via the per-row `applyPresence`) on two points: the coding-club
 * rule is "marked for the whole day", so we fan each row out across both slots;
 * and at this volume (thousands of rows) the per-row path's ~4 queries/cell is too
 * slow, so this runs in BULK: preload events, talents and existing presences in a
 * handful of `findMany`s, diff in memory, then write with `createMany` + grouped
 * `updateMany`. The semantics are kept identical to `applyPresence`: ids resolve
 * through `Event.externalId` / `Talent.externalId`, presences land on the event's
 * start day, rows are tagged `source: 'system'`, and re-running is idempotent (an
 * unchanged cell is a no-op, a flipped present/absent updates in place, including
 * over a prior manual/QR mark).
 *
 * CSV columns (defaults match the worker export; override with --col-*):
 *   event_external_id   Salesforce Campaign id  (= Event.externalId)
 *   talent_external_id  resolved SF lead/contact id (= Talent.externalId)
 *   present             true | false  (also accepts oui/non, 1/0, présent/absent)
 *
 * Run (preview first, then write):
 *   bun run scripts/import-coding-club-presence.ts --csv=/path/coding-club-presence.csv --dry-run
 *   bun run scripts/import-coding-club-presence.ts --csv=/path/coding-club-presence.csv --force   # non-local DB
 *
 * Self-contained like the other scripts (no `$lib` imports), so it runs against
 * the production image.
 */

import fs from 'node:fs';

import {
  loadEnv,
  makePrisma,
  type PresenceSlot,
  type PresenceStatus,
  type PresenceImportInput,
} from './sf-presence';

// Both créneaux of the event's start day: a coding club runs all day, so a
// present/absent row applies to morning AND afternoon.
const SLOTS: PresenceSlot[] = ['morning', 'afternoon'];

// ── CSV parsing (same dialect as the other importers) ────────────────────────

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const TRUTHY = new Set([
  '1',
  'true',
  'oui',
  'yes',
  'present',
  'présent',
  'présente',
]);
const FALSY = new Set(['0', 'false', 'non', 'no', 'absent', 'absente', '']);

function parsePresent(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  throw new Error(`Valeur de présence non reconnue: "${raw}"`);
}

interface CsvCols {
  event: string;
  talent: string;
  present: string;
}

/** Read the CSV into one fact per row (slot fan-out happens at apply time). */
function loadRows(
  csvPath: string,
  delim: string,
  cols: CsvCols,
): PresenceImportInput[] {
  const text = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0], delim).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const iEvent = col(cols.event);
  const iTalent = col(cols.talent);
  const iPresent = col(cols.present);

  const missing = [
    iEvent < 0 ? cols.event : null,
    iTalent < 0 ? cols.talent : null,
    iPresent < 0 ? cols.present : null,
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `CSV header missing required column(s): ${missing.join(', ')}.\n` +
        `Found: ${header.join(', ')}.\n` +
        'Override names with --col-event= / --col-talent= / --col-present=.',
    );
  }

  return lines.slice(1).map((line, idx) => {
    const cells = parseCsvLine(line, delim);
    const at = (i: number) => cells[i] ?? '';
    return {
      eventExternalId: at(iEvent),
      talentExternalId: at(iTalent),
      present: (() => {
        try {
          return parsePresent(at(iPresent));
        } catch (e) {
          throw new Error(`Ligne ${idx + 2}: ${(e as Error).message}`);
        }
      })(),
    };
  });
}

// ── Day math (inlined from ./sf-presence, kept in sync by inspection) ─────────

const DEFAULT_TIMEZONE = 'Europe/Paris';

/** Event start instant -> 'YYYY-MM-DD' in the campus timezone. */
function toDateKey(instant: Date, timezone: string): string {
  return instant.toLocaleDateString('en-CA', { timeZone: timezone });
}
/** 'YYYY-MM-DD' -> the @db.Date value (UTC midnight) émargement keys on. */
function dateKeyToDbDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}
/** @db.Date value -> 'YYYY-MM-DD' (inverse of dateKeyToDbDate). */
function dbDateToKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Runner ───────────────────────────────────────────────────────────────────

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** One émargement cell to write: a (talent, event, day, slot) at a status. */
interface Cell {
  key: string;
  talentId: string;
  eventId: string;
  day: Date;
  slot: PresenceSlot;
  status: PresenceStatus;
}

async function main() {
  loadEnv();
  const dryRun = flag('dry-run');
  const force = flag('force');
  const csvPath = arg('csv');
  const delim = arg('delimiter') ?? ',';
  const cols: CsvCols = {
    event: arg('col-event') ?? 'event_external_id',
    talent: arg('col-talent') ?? 'talent_external_id',
    present: arg('col-present') ?? 'present',
  };

  if (!csvPath) {
    console.error(
      'Pass --csv=/path/to/coding-club-presence.csv (see header for column flags).',
    );
    process.exit(1);
  }

  const url = process.env.DATABASE_URL ?? '';
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (!isLocal && !force && !dryRun) {
    console.error(
      'Refusing to write: DATABASE_URL is not local.\n' +
        'Re-run with --force to target this database (e.g. prod), or --dry-run to preview.',
    );
    process.exit(1);
  }

  const rows = loadRows(csvPath, delim, cols);
  console.log(
    `${dryRun ? 'DRY RUN - ' : ''}${rows.length} row(s) from ${csvPath} ` +
      `-> ${rows.length * SLOTS.length} présence cell(s) (matin + après-midi)`,
  );
  if (rows.length === 0) {
    console.log('Nothing to do (empty CSV).');
    return;
  }

  const prisma = makePrisma();
  const tally = {
    created: 0,
    updated: 0,
    unchanged: 0,
    event_not_found: 0,
    talent_not_found: 0,
  };
  // A Set so a missing event shared by many rows is reported once, not N times.
  const problems = new Set<string>();

  try {
    // Bulk over per-row round-trips: 47k sequential queries (4 per applyPresence
    // call × 2 slots × N rows) is the bottleneck. Instead preload events,
    // talents and existing presences in a handful of `findMany`s, diff in
    // memory, then write with `createMany` / grouped `updateMany`.

    // 1. Resolve events + talents by external id, in two queries.
    const eventExtIds = [...new Set(rows.map((r) => r.eventExternalId))];
    const talentExtIds = [...new Set(rows.map((r) => r.talentExternalId))];
    console.log(
      `Préchargement: ${eventExtIds.length} events, ${talentExtIds.length} talents...`,
    );
    const [events, talents] = await Promise.all([
      prisma.event.findMany({
        where: { externalId: { in: eventExtIds } },
        select: {
          id: true,
          externalId: true,
          date: true,
          campus: { select: { timezone: true } },
        },
      }),
      prisma.talent.findMany({
        where: { externalId: { in: talentExtIds } },
        select: { id: true, externalId: true },
      }),
    ]);
    const eventByExt = new Map(events.map((e) => [e.externalId!, e]));
    const talentByExt = new Map(talents.map((t) => [t.externalId!, t]));

    // 2. Build the target cells (both slots on the event's start day). A repeated
    // (event, talent) row collapses onto the same cells, last value winning.
    const cellByKey = new Map<string, Cell>();
    for (const row of rows) {
      const event = eventByExt.get(row.eventExternalId);
      if (!event) {
        tally.event_not_found += 1;
        problems.add(
          `[event_not_found] Event.externalId=${row.eventExternalId}`,
        );
        continue;
      }
      const talent = talentByExt.get(row.talentExternalId);
      if (!talent) {
        tally.talent_not_found += 1;
        problems.add(
          `[talent_not_found] Talent.externalId=${row.talentExternalId}`,
        );
        continue;
      }
      const tz = event.campus?.timezone ?? DEFAULT_TIMEZONE;
      const dayKey = toDateKey(event.date, tz);
      const day = dateKeyToDbDate(dayKey);
      const status: PresenceStatus = row.present ? 'present' : 'absent';
      for (const slot of SLOTS) {
        const key = `${talent.id}|${event.id}|${dayKey}|${slot}`;
        cellByKey.set(key, {
          key,
          talentId: talent.id,
          eventId: event.id,
          day,
          slot,
          status,
        });
      }
    }
    const cells = [...cellByKey.values()];

    // 3. Load the presences that already exist for these (event, talent) pairs in
    // one query, keyed the same way, to decide create / update / unchanged.
    const eventIds = [...new Set(cells.map((c) => c.eventId))];
    const talentIds = [...new Set(cells.map((c) => c.talentId))];
    const existing = await prisma.eventPresence.findMany({
      where: { eventId: { in: eventIds }, talentId: { in: talentIds } },
      select: {
        id: true,
        talentId: true,
        eventId: true,
        day: true,
        slot: true,
        status: true,
        source: true,
      },
    });
    const existingByKey = new Map(
      existing.map((e) => [
        `${e.talentId}|${e.eventId}|${dbDateToKey(e.day)}|${e.slot}`,
        e,
      ]),
    );

    // 4. Diff. Same status already imported (source 'system') is a no-op; any
    // other existing cell is updated in place (overwrites manual/QR, matching the
    // previous per-row behaviour); the rest are created.
    const toCreate: Cell[] = [];
    const toPresent: string[] = [];
    const toAbsent: string[] = [];
    for (const c of cells) {
      const ex = existingByKey.get(c.key);
      if (!ex) {
        toCreate.push(c);
        tally.created += 1;
      } else if (ex.status === c.status && ex.source === 'system') {
        tally.unchanged += 1;
      } else {
        (c.status === 'present' ? toPresent : toAbsent).push(ex.id);
        tally.updated += 1;
      }
    }

    // 5. Write in bulk (chunked to keep statements bounded). Progress tracks the
    // cells actually written, the only slow part once everything is in memory.
    if (!dryRun) {
      const now = new Date();
      const totalWrites = toCreate.length + toPresent.length + toAbsent.length;
      let written = 0;
      let lastPct = -1;
      const renderProgress = () => {
        const pct =
          totalWrites === 0 ? 100 : Math.floor((written / totalWrites) * 100);
        if (pct === lastPct) return;
        lastPct = pct;
        const line = `  Écriture: ${pct}% (${written}/${totalWrites} cellules)`;
        if (process.stdout.isTTY) process.stdout.write(`\r${line}`);
        else console.log(line);
      };
      renderProgress();

      for (const part of chunk(toCreate, 1000)) {
        await prisma.eventPresence.createMany({
          data: part.map((c) => ({
            talentId: c.talentId,
            eventId: c.eventId,
            day: c.day,
            slot: c.slot,
            status: c.status,
            source: 'system' as const,
            markedAt: now,
          })),
          skipDuplicates: true,
        });
        written += part.length;
        renderProgress();
      }
      for (const [status, ids] of [
        ['present', toPresent],
        ['absent', toAbsent],
      ] as const) {
        for (const part of chunk(ids, 1000)) {
          await prisma.eventPresence.updateMany({
            where: { id: { in: part } },
            data: { status, source: 'system', markedAt: now },
          });
          written += part.length;
          renderProgress();
        }
      }
      if (process.stdout.isTTY) process.stdout.write('\n');
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('\nResult (presence cells):');
  console.log(`  created:           ${tally.created}`);
  console.log(`  updated:           ${tally.updated}`);
  console.log(`  unchanged:         ${tally.unchanged}`);
  console.log(`  event_not_found:   ${tally.event_not_found}`);
  console.log(`  talent_not_found:  ${tally.talent_not_found}`);

  if (problems.size > 0) {
    const list = [...problems];
    console.log('\nSkipped facts:');
    for (const p of list.slice(0, 50)) console.log(`  ${p}`);
    if (list.length > 50) console.log(`  ... and ${list.length - 50} more`);
  }

  if (dryRun) console.log('\nDRY RUN - no rows written.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
