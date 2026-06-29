/**
 * OPTIONAL CSV driver over `applyPresence`.
 *
 * The actual callable lives in `./sf-presence` (`applyPresence`); that is all you
 * need if you drive the back-fill from your own loop. This file is just one ready
 * driver: point it at a CSV (e.g. a Salesforce campaign-member export) and it
 * calls `applyPresence` per row. Ignore it entirely if you write your own glue.
 *
 * Salesforce gives one row per campaign membership (one contact, one campaign),
 * which is exactly one (talent, event, present?) fact, so a dump maps 1:1 to rows
 * with no reshaping. Both ids resolve through `*.externalId` because Salesforce
 * has no Jump talent id, only its own external id.
 *
 * Run (preview first, then write):
 *   bun run scripts/import-sf-presence.ts --csv=/path/dump.csv --dry-run \
 *     --col-event="Campaign: External ID" --col-talent="Contact: External ID" \
 *     --col-present="Member Status" --present-true="Attended,Présent"
 *   bun run scripts/import-sf-presence.ts --csv=/path/dump.csv --force   # non-local DB
 *
 * Re-running is safe: an unchanged row is a no-op, a flipped present/absent
 * updates in place. Self-contained like the other scripts (no `$lib` imports), so
 * it runs against the production image.
 */

import fs from 'node:fs';

import {
  applyPresence,
  loadEnv,
  makePrisma,
  type PresenceImportInput,
  type PresenceStatus,
} from './sf-presence';

// ── CSV parsing ──────────────────────────────────────────────────────────────

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

/**
 * Which CSV header maps to which field. Defaults are the canonical names, but a
 * raw Salesforce export won't use them, so each is overridable from the CLI
 * (`--col-talent="Contact: External ID"`) and matched case-insensitively. Only
 * `event`, `talent` and `present` are required; the rest fall back to the import
 * defaults (start day, afternoon créneau, present/absent) when absent.
 */
interface CsvCols {
  event: string;
  talent: string;
  present: string;
  day: string;
  slot: string;
  status: string;
}

/**
 * Read the CSV into records `applyPresence` accepts. The presence flag: with
 * `presentTrue` set (from `--present-true=`), a value is present iff it is in
 * that set, so a raw SF status picklist ("Attended" / "No Show") maps straight
 * through without precomputing a boolean. Without it, the column is read as a
 * boolean (true/false/oui/non/présent/absent/...).
 */
function loadRecords(
  csvPath: string,
  delim: string,
  cols: CsvCols,
  presentTrue: Set<string> | null,
): PresenceImportInput[] {
  const text = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0], delim).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const iEvent = col(cols.event);
  const iTalent = col(cols.talent);
  const iPresent = col(cols.present);
  const iDay = col(cols.day);
  const iSlot = col(cols.slot);
  const iStatus = col(cols.status);

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

  const readPresent = (raw: string) =>
    presentTrue ? presentTrue.has(raw.trim().toLowerCase()) : parsePresent(raw);

  return lines.slice(1).map((line, idx) => {
    const cells = parseCsvLine(line, delim);
    const at = (i: number) => (i >= 0 ? (cells[i] ?? '') : '');
    const rec: PresenceImportInput = {
      eventExternalId: at(iEvent),
      talentExternalId: at(iTalent),
      present: (() => {
        try {
          return readPresent(at(iPresent));
        } catch (e) {
          throw new Error(`Ligne ${idx + 2}: ${(e as Error).message}`);
        }
      })(),
    };
    const day = at(iDay);
    if (day) rec.day = day;
    const slot = at(iSlot);
    if (slot === 'morning' || slot === 'afternoon') rec.slot = slot;
    const status = at(iStatus);
    if (status) rec.status = status as PresenceStatus;
    return rec;
  });
}

// ── Runner ────────────────────────────────────────────────────────────────

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
    day: arg('col-day') ?? 'day',
    slot: arg('col-slot') ?? 'slot',
    status: arg('col-status') ?? 'status',
  };
  // e.g. --present-true="Attended,Présent,Responded": every other value is absent.
  const presentTrueRaw = arg('present-true');
  const presentTrue = presentTrueRaw
    ? new Set(presentTrueRaw.split(',').map((s) => s.trim().toLowerCase()))
    : null;

  if (!csvPath) {
    console.error(
      'Pass --csv=/path/to/dump.csv (see header for column flags).',
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

  const records = loadRecords(csvPath, delim, cols, presentTrue);
  console.log(
    `${dryRun ? 'DRY RUN - ' : ''}${records.length} record(s) to apply from ${csvPath}`,
  );
  if (records.length === 0) {
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
    for (const rec of records) {
      const res = await applyPresence(prisma, rec, { dryRun });
      if (res.ok) {
        tally[res.action] += 1;
      } else {
        tally[res.reason] += 1;
        problems.push(`[${res.reason}] ${res.detail}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('\nResult:');
  console.log(`  created:           ${tally.created}`);
  console.log(`  updated:           ${tally.updated}`);
  console.log(`  unchanged:         ${tally.unchanged}`);
  console.log(`  event_not_found:   ${tally.event_not_found}`);
  console.log(`  talent_not_found:  ${tally.talent_not_found}`);
  console.log(`  day_out_of_window: ${tally.day_out_of_window}`);

  if (problems.length > 0) {
    console.log('\nSkipped:');
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
