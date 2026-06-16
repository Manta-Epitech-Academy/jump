/**
 * Grant XP to a cohort from a scoreboard CSV, as a named, reusable reward.
 *
 * This is the *invocation* tool behind the `reward` XP source: each scored stage
 * activity (a CTF, a hackathon...) is one `XpReward` row, and every run credits
 * the participants listed in that activity's CSV. Re-running the same CSV never
 * double-grants (the grant is idempotent on (talent, reward)), so a fix is just
 * an edit-and-rerun. The same script serves every future activity: point it at
 * the next CSV with a new `--key`.
 *
 * The tool's real job is the reconciliation tail, not the happy path. An export
 * email rarely lines up perfectly with a Jump talent (typos, alternate
 * addresses, spare CTF accounts handed to students who could not log in). So the
 * design centres on classifying every row safely and never guessing:
 *
 *   matched    email resolves to exactly one talent in the campus cohort
 *   unmatched  no talent for that email (reconcile via --map, then re-run)
 *   bad-score  score is not a positive integer
 *   duplicate  the same CSV email appears on more than one row
 *   conflict   two different CSV rows resolve to the SAME talent
 *
 * Only `matched` rows are written. The rest are reported (and, with --report,
 * written to a CSV artifact) for a human to resolve. Nothing is silently
 * last-write-wins: a conflict that would otherwise pick an arbitrary score for a
 * talent is held back, not gambled.
 *
 * Matching: case-insensitive email against the campus cohort (talents with a
 * Participation in `--campus`). The cohort scope is the safety guard, not any
 * column in the CSV, so a row for another campus simply has no talent here and
 * lands in `unmatched`. `--map csvEmail,talentEmail` rewrites a CSV email to a
 * real talent email before lookup, so spare accounts are reconciled in a
 * tracked file instead of by editing the source scoreboard.
 *
 * Columns: defaults are the CTFd export (`user email`, `score`); override with
 * `--email-col` / `--score-col`, and `--delimiter` for a non-comma CSV (FR Excel
 * exports with `;`), for a differently shaped file.
 *
 * Amount: by default the talent's own score (per the 10 XP = 1 min scale), so the
 * reward's `XpReward.xpAmount` is left null and the per-talent amount lives on the
 * grant. With `--amount=<n>` every matched talent gets the same flat XP (no score
 * column needed, e.g. an attendance-based reward) and that shared amount is stored
 * on `XpReward.xpAmount` instead.
 *
 * Self-contained on purpose (no `$lib` import): like the other scripts it must
 * run against the production image where Vite aliases do not resolve. The grant
 * sourceId format and the xp recompute are inlined from
 * src/lib/server/services/xpService.ts, keep them in sync.
 *
 * Safety: refuses a non-local DATABASE_URL unless `--force`, writes nothing in a
 * dry run. Always dry-run first (ideally with --report) to read the match rate
 * and the unresolved rows before crediting prod.
 *
 * Run:
 *   bun scripts/grant-reward-from-csv.ts \
 *     --campus=Strasbourg --key=osint-ctfd-2026-06-15 \
 *     --name="OSINT CTFD Stage Seconde (15/06/2026)" --awarded-on=2026-06-15 \
 *     --csv=/path/OSINT_CTF-scoreboard.csv --report=/tmp/osint-report.csv --dry-run
 *
 *   (add --map=/path/aliases.csv to reconcile, drop --dry-run + add --force to write)
 */
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ─── args ──────────────────────────────────────────────────────────────────
function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
const has = (name: string) => process.argv.includes(`--${name}`);

const USAGE = `Grant XP to a campus cohort from a scoreboard CSV, as a named reward.

Usage:
  bun scripts/grant-reward-from-csv.ts --campus=<name> --key=<slug> --name=<label> --csv=<file> [options]

Required:
  --campus=<name>          Campus name as stored in Jump (e.g. Strasbourg)
  --key=<slug>             Stable XpReward key, idempotent across runs (e.g. osint-ctfd-2026-06-15)
  --name=<label>           Human label shown for the reward
  --csv=<file>             Scoreboard CSV path

Options:
  --awarded-on=YYYY-MM-DD  Activity's real date, stored on the reward (not the run date)
  --amount=<n>             Flat XP for every matched talent (no score column needed).
                           Omit to credit each talent their own score, 1:1.
  --map=<file>             Reconcile emails: a CSV with columns csvEmail,talentEmail
  --report=<file>          Write the full per-row classification to a CSV artifact
  --email-col=<header>     Email column header (default: "user email")
  --score-col=<header>     Score column header (default: "score"; ignored with --amount)
  --delimiter=<char>       CSV field delimiter (default: ","; e.g. ";" for FR Excel)
  --dry-run                Classify and report, write nothing
  --force                  Allow a non-local DATABASE_URL (prod); required off localhost
  -h, --help               Show this help and exit

Each row is classified matched / unmatched / bad-score / duplicate / conflict;
only matched rows are credited. Unmatched/conflict are reported, never guessed.
Always --dry-run --report first, then re-run with --force to write.

Example:
  bun scripts/grant-reward-from-csv.ts \\
    --campus=Strasbourg --key=osint-ctfd-2026-06-15 \\
    --name="OSINT CTFD Stage Seconde (15/06/2026)" --awarded-on=2026-06-15 \\
    --csv=/path/OSINT_CTF-scoreboard.csv --report=/tmp/report.csv --dry-run`;

if (has('help') || process.argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}

// Built after the --help short-circuit so printing usage never spins up DB infra.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const campusName = flag('campus');
const key = flag('key');
const name = flag('name');
const awardedOnRaw = flag('awarded-on');
const csvPath = flag('csv');
const mapPath = flag('map');
const reportPath = flag('report');
const emailCol = (flag('email-col') ?? 'user email').toLowerCase();
const scoreCol = (flag('score-col') ?? 'score').toLowerCase();
const flatAmountRaw = flag('amount');
const delimiter = flag('delimiter') ?? ',';
const dryRun = has('dry-run');
const force = has('force');

function die(msg: string): never {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

if (!campusName || !key || !name || !csvPath) {
  die(
    'Missing required flag(s): --campus --key --name --csv. Run --help for usage.',
  );
}

const awardedOn = awardedOnRaw ? new Date(`${awardedOnRaw}T00:00:00Z`) : null;
if (awardedOnRaw && Number.isNaN(awardedOn!.getTime())) {
  die(`Invalid --awarded-on "${awardedOnRaw}" (expected YYYY-MM-DD).`);
}

if (delimiter.length !== 1)
  die('Invalid --delimiter (expected a single character).');
if (
  flatAmountRaw !== undefined &&
  (!/^\d+$/.test(flatAmountRaw) || Number(flatAmountRaw) <= 0)
)
  die(`Invalid --amount "${flatAmountRaw}" (expected a positive integer).`);
// Flat-amount mode: every matched talent gets the same XP, no score column
// needed. Score mode (null): XP = the talent's own score column, 1:1.
const flatAmount = flatAmountRaw !== undefined ? Number(flatAmountRaw) : null;

const url = process.env.DATABASE_URL ?? '';
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
if (!isLocal && !force) {
  die(
    'Refusing to write: DATABASE_URL is not local.\n' +
      'Re-run with --force to target this database (e.g. prod).',
  );
}

// ─── CSV (self-contained; quotes tolerated) ──────────────────────────────────
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

function rowsOf(file: string, delim: string): string[][] {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
  const lines = text.split('\n').filter((l) => l.length > 0);
  if (lines.length < 2) die(`CSV "${file}" has no data rows.`);
  return lines.map((l) => parseCsvLine(l, delim));
}

function colIndex(header: string[], wanted: string, file: string): number {
  const idx = header.findIndex((h) => h.toLowerCase() === wanted);
  if (idx === -1)
    die(
      `CSV "${file}" is missing the "${wanted}" column. Got: ${header.join(', ')}`,
    );
  return idx;
}

/** One raw scoreboard row: email lower-cased, score kept as a string for strict parsing. */
type Parsed = { email: string; scoreRaw: string };

function readScoreboard(file: string): Parsed[] {
  const [header, ...body] = rowsOf(file, delimiter);
  const iEmail = colIndex(header, emailCol, file);
  // Score column is only required in score mode; flat-amount mode ignores it.
  const iScore =
    flatAmount === null
      ? colIndex(header, scoreCol, file)
      : header.findIndex((h) => h.toLowerCase() === scoreCol);
  return body.map((f) => ({
    email: (f[iEmail] ?? '').toLowerCase(),
    scoreRaw: iScore >= 0 ? (f[iScore] ?? '').trim() : '',
  }));
}

/** csvEmail -> talentEmail overrides, both lower-cased (always comma-delimited). */
function readAliases(file: string): Map<string, string> {
  const [header, ...body] = rowsOf(file, ',');
  const iFrom = colIndex(header, 'csvemail', file);
  const iTo = colIndex(header, 'talentemail', file);
  const map = new Map<string, string>();
  for (const f of body) {
    const from = (f[iFrom] ?? '').toLowerCase();
    const to = (f[iTo] ?? '').toLowerCase();
    if (from && to) map.set(from, to);
  }
  return map;
}

// ─── pure classification (no I/O, no DB) ──────────────────────────────────────
type Talent = { id: string; email: string; nom: string; prenom: string };

type Row =
  | {
      status: 'matched';
      csvEmail: string;
      lookupEmail: string;
      talent: Talent;
      amount: number;
    }
  | {
      status: 'conflict';
      csvEmail: string;
      lookupEmail: string;
      talent: Talent;
      amount: number;
    }
  | { status: 'unmatched'; csvEmail: string; lookupEmail: string }
  | { status: 'bad-score'; csvEmail: string; scoreRaw: string }
  | { status: 'duplicate'; csvEmail: string };

function classify(
  parsed: Parsed[],
  cohortByEmail: Map<string, Talent>,
  aliases: Map<string, string>,
  resolveAmount: (scoreRaw: string) => number | null,
): Row[] {
  const emailCount = new Map<string, number>();
  for (const p of parsed)
    emailCount.set(p.email, (emailCount.get(p.email) ?? 0) + 1);

  // First pass: classify each row on its own.
  const pass1: Row[] = parsed.map((p) => {
    if ((emailCount.get(p.email) ?? 0) > 1)
      return { status: 'duplicate', csvEmail: p.email };
    const amount = resolveAmount(p.scoreRaw);
    if (amount === null)
      return { status: 'bad-score', csvEmail: p.email, scoreRaw: p.scoreRaw };
    const lookupEmail = aliases.get(p.email) ?? p.email;
    const talent = cohortByEmail.get(lookupEmail);
    if (!talent) return { status: 'unmatched', csvEmail: p.email, lookupEmail };
    return {
      status: 'matched',
      csvEmail: p.email,
      lookupEmail,
      talent,
      amount,
    };
  });

  // Second pass: two distinct rows landing on the same talent is a conflict, not
  // a last-write-wins gamble (e.g. a spare account aliased onto a student who
  // also competed under their own email). Hold both back for a human.
  const talentCount = new Map<string, number>();
  for (const r of pass1)
    if (r.status === 'matched')
      talentCount.set(r.talent.id, (talentCount.get(r.talent.id) ?? 0) + 1);

  return pass1.map((r) =>
    r.status === 'matched' && (talentCount.get(r.talent.id) ?? 0) > 1
      ? { ...r, status: 'conflict' as const }
      : r,
  );
}

// ─── report ───────────────────────────────────────────────────────────────────
const csvCell = (v: string | number) =>
  /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);

function writeReport(file: string, rows: Row[]): void {
  const lines = ['csv_email,status,lookup_email,talent_id,talent_name,amount'];
  for (const r of rows) {
    const lookup = 'lookupEmail' in r ? r.lookupEmail : '';
    const tid = 'talent' in r ? r.talent.id : '';
    const tname = 'talent' in r ? `${r.talent.prenom} ${r.talent.nom}` : '';
    const amount = 'amount' in r ? r.amount : '';
    lines.push(
      [r.csvEmail, r.status, lookup, tid, tname, amount].map(csvCell).join(','),
    );
  }
  writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}

function attentionList(rows: Row[], status: Row['status']): string {
  return rows
    .filter((r) => r.status === status)
    .map((r) =>
      r.status === 'matched' || r.status === 'conflict'
        ? `${r.csvEmail} -> ${r.lookupEmail} (${r.talent.prenom} ${r.talent.nom})`
        : r.status === 'unmatched'
          ? `${r.csvEmail}${r.lookupEmail !== r.csvEmail ? ` -> ${r.lookupEmail}` : ''}`
          : r.status === 'bad-score'
            ? `${r.csvEmail} (score="${r.scoreRaw}")`
            : r.csvEmail,
    )
    .join('\n  ');
}

// ─── inlined from xpService (keep in sync) ─────────────────────────────────────
const rewardGrantSourceId = (rewardId: string, talentId: string) =>
  `${rewardId}_${talentId}`;

async function main() {
  const mode =
    flatAmount !== null ? `flat ${flatAmount} XP each` : 'XP = score';
  console.log(
    `Grant reward "${key}" to ${campusName} (${mode}): ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}${
      force ? ' [--force]' : ''
    }\n`,
  );

  const campus = await prisma.campus.findFirst({
    where: { name: campusName },
    select: { id: true, name: true },
  });
  if (!campus) die(`No campus named "${campusName}".`);

  // Cohort = talents with at least one participation in this campus. The scope is
  // the safety guard: a row for another campus has no talent here.
  const cohort = await prisma.talent.findMany({
    where: {
      participations: { some: { campusId: campus.id } },
      email: { not: null },
    },
    select: { id: true, email: true, nom: true, prenom: true },
  });
  const byEmail = new Map<string, Talent>();
  for (const t of cohort)
    byEmail.set(t.email!.toLowerCase(), { ...t, email: t.email! });

  const parsed = readScoreboard(csvPath!);
  const aliases = mapPath ? readAliases(mapPath) : new Map<string, string>();

  // Surface aliases that never applied (stale entries) so the map stays honest.
  const seen = new Set(parsed.map((p) => p.email));
  const staleAliases = [...aliases.keys()].filter((k) => !seen.has(k));

  const resolveAmount =
    flatAmount !== null
      ? () => flatAmount
      : (s: string) => (/^\d+$/.test(s) && Number(s) > 0 ? Number(s) : null);
  const rows = classify(parsed, byEmail, aliases, resolveAmount);
  const count = (s: Row['status']) => rows.filter((r) => r.status === s).length;
  const matched = rows.filter((r) => r.status === 'matched') as Extract<
    Row,
    { status: 'matched' }
  >[];
  const totalXp = matched.reduce((s, m) => s + m.amount, 0);

  console.log(`Campus cohort:    ${cohort.length} talents`);
  console.log(`CSV rows:         ${parsed.length}`);
  console.log(
    `Aliases loaded:   ${aliases.size}${staleAliases.length ? ` (${staleAliases.length} stale)` : ''}`,
  );
  console.log(`Matched:          ${matched.length}`);
  console.log(`Unmatched:        ${count('unmatched')}`);
  console.log(`Conflict:         ${count('conflict')}`);
  console.log(`Duplicate:        ${count('duplicate')}`);
  console.log(`Bad score:        ${count('bad-score')}`);
  console.log(`Total XP to grant: ${totalXp}\n`);

  for (const [label, status] of [
    ['Unmatched (no talent here; add to --map and re-run)', 'unmatched'],
    ['Conflict (multiple rows -> same talent; resolve by hand)', 'conflict'],
    ['Duplicate CSV email (resolve in source)', 'duplicate'],
    ['Bad score (not a positive integer)', 'bad-score'],
  ] as const) {
    if (count(status))
      console.log(`${label}:\n  ${attentionList(rows, status)}\n`);
  }
  if (staleAliases.length)
    console.log(
      `Stale aliases (csvEmail not in CSV):\n  ${staleAliases.join('\n  ')}\n`,
    );

  if (reportPath) {
    writeReport(reportPath, rows);
    console.log(`Report written: ${reportPath}\n`);
  }

  if (dryRun) {
    console.log('DRY RUN: no rows written.');
    return;
  }
  if (!matched.length) {
    console.log('Nothing matched: no reward created, no grants written.');
    return;
  }

  // Upsert the reward category (idempotent on key), then grant per talent.
  const reward = await prisma.xpReward.upsert({
    where: { key: key! },
    // flat mode records the shared amount on the reward; score mode leaves it
    // null because the per-talent amount lives on each grant.
    update: {
      name: name!,
      campusId: campus.id,
      awardedOn,
      xpAmount: flatAmount,
    },
    create: {
      key: key!,
      name: name!,
      xpAmount: flatAmount,
      campusId: campus.id,
      awardedOn,
    },
    select: { id: true },
  });

  console.log(`\nWriting ${matched.length} grants…`);
  let written = 0;
  for (const m of matched) {
    await prisma.$transaction(async (tx) => {
      await tx.xpGrant.upsert({
        where: {
          source_sourceId: {
            source: 'reward',
            sourceId: rewardGrantSourceId(reward.id, m.talent.id),
          },
        },
        update: { amount: m.amount, campusId: campus.id },
        create: {
          talentId: m.talent.id,
          source: 'reward',
          sourceId: rewardGrantSourceId(reward.id, m.talent.id),
          amount: m.amount,
          campusId: campus.id,
        },
      });
      // recompute Talent.xp = SUM(XpGrant.amount), inlined from xpService.
      const agg = await tx.xpGrant.aggregate({
        where: { talentId: m.talent.id },
        _sum: { amount: true },
      });
      await tx.talent.update({
        where: { id: m.talent.id },
        data: { xp: agg._sum.amount ?? 0 },
      });
    });
    written++;
  }

  console.log(`Done. ${written} talents credited for "${key}" (${reward.id}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
