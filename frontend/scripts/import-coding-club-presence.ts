/**
 * CSV driver: coding-club attendance → émargement (both half-days).
 *
 * Feeds the CSV produced by the worker
 * (`jump-sf-worker/src/exportCodingClubPresence.ts`) into the émargement grid.
 * Each CSV row is one (event, talent, present?) fact; a coding club is a single
 * day with a morning and an afternoon créneau, so **each row writes TWO
 * `EventPresence` cells** — one `morning`, one `afternoon` — both carrying the
 * same present/absent status on the event's start day.
 *
 * This is the only difference from the generic `import-sf-presence.ts` driver
 * (which writes one créneau per row): the coding-club rule is "marked for the
 * whole day", so we fan each row out across both slots. The heavy lifting still
 * goes through the shared `applyPresence` callable in `./sf-presence`, so the
 * id resolution (`Event.externalId` / `Talent.externalId`), the day-window
 * guard, the `source: 'system'` tagging, and the idempotent upsert are all
 * identical to the other importers. Re-running is safe: an unchanged cell is a
 * no-op, a flipped present/absent updates in place.
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
  applyPresence,
  loadEnv,
  makePrisma,
  type PresenceSlot,
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

// ── Runner ───────────────────────────────────────────────────────────────────

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
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
    day_out_of_window: 0,
  };
  const problems: string[] = [];

  try {
    for (const row of rows) {
      for (const slot of SLOTS) {
        const res = await applyPresence(prisma, { ...row, slot }, { dryRun });
        if (res.ok) {
          tally[res.action] += 1;
        } else {
          tally[res.reason] += 1;
          // One skip line per fact, not per slot: both slots fail for the same
          // reason (event/talent missing), so dedup to keep the report readable.
          if (slot === SLOTS[0]) problems.push(`[${res.reason}] ${res.detail}`);
        }
      }
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
  console.log(`  day_out_of_window: ${tally.day_out_of_window}`);

  if (problems.length > 0) {
    console.log('\nSkipped facts:');
    for (const p of problems.slice(0, 50)) console.log(`  ${p}`);
    if (problems.length > 50)
      console.log(`  ... and ${problems.length - 50} more`);
  }

  if (dryRun) console.log('\nDRY RUN - no rows written.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
