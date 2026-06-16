/**
 * Grant XP to a cohort from a scoreboard CSV, as a named, reusable reward.
 *
 * This is the *invocation* tool behind the `reward` XP source: each scored stage
 * activity (a CTF, a hackathon...) is one `XpReward` row, and every run credits
 * the participants listed in that activity's CSV. Re-running the same CSV never
 * double-grants (the grant is idempotent on (talent, reward)), so a fixed typo
 * in the file is just an edit-and-rerun. The same script serves every future
 * activity: point it at the next CSV with a new `--key`.
 *
 * What it does:
 *   1. resolves the campus by name (`--campus`),
 *   2. loads that campus's cohort (talents with a Participation there) and indexes
 *      them by lower-cased email,
 *   3. reads the CSV, keeps only rows whose bracket/city is the campus, and maps
 *      each to a talent by email (case-insensitive); unmatched emails are
 *      reported, never guessed,
 *   4. upserts the `XpReward` (idempotent on `--key`),
 *   5. grants each matched talent `score` XP (1:1) as source `reward`, then
 *      recomputes that talent's cached `Talent.xp`.
 *
 * The amount is the talent's own score (per the 10 XP = 1 min scale), not the
 * reward's `xpAmount`, so `XpReward.xpAmount` is left null here.
 *
 * Self-contained on purpose (no `$lib` import): like the other scripts it must
 * run against the production image where Vite aliases do not resolve. The grant
 * sourceId format and the xp recompute are inlined from
 * src/lib/server/services/xpService.ts, keep them in sync.
 *
 * Safety: refuses a non-local DATABASE_URL unless `--force`, and writes nothing
 * without it being a non-dry run. Dry-run is the default mindset: always run it
 * first to read the match rate and the unmatched list before crediting prod.
 *
 * Run:
 *   bun scripts/grant-reward-from-csv.ts \
 *     --campus=Strasbourg --key=osint-ctfd-2026-06-15 \
 *     --name="OSINT CTFD Stage Seconde (15/06/2026)" --awarded-on=2026-06-15 \
 *     --csv=/path/OSINT_CTF-scoreboard.csv --dry-run
 *
 *   (re-run without --dry-run, with --force, to write to a non-local DB)
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── args ────────────────────────────────────────────────────────────────────
function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
const has = (name: string) => process.argv.includes(`--${name}`);

const campusName = flag('campus');
const key = flag('key');
const name = flag('name');
const awardedOnRaw = flag('awarded-on');
const csvPath = flag('csv');
const dryRun = has('dry-run');
const force = has('force');

function die(msg: string): never {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

if (!campusName || !key || !name || !csvPath) {
  die(
    'Missing required flag(s).\n' +
      'Required: --campus --key --name --csv\n' +
      'Optional: --awarded-on=YYYY-MM-DD --dry-run --force',
  );
}

const awardedOn = awardedOnRaw ? new Date(`${awardedOnRaw}T00:00:00Z`) : null;
if (awardedOnRaw && Number.isNaN(awardedOn!.getTime())) {
  die(`Invalid --awarded-on "${awardedOnRaw}" (expected YYYY-MM-DD).`);
}

const url = process.env.DATABASE_URL ?? '';
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
if (!isLocal && !force) {
  die(
    'Refusing to write: DATABASE_URL is not local.\n' +
      'Re-run with --force to target this database (e.g. prod).',
  );
}

// ─── minimal CSV parsing (self-contained; clean scoreboard, quotes tolerated) ──
function parseCsvLine(line: string): string[] {
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
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

type CsvRow = { email: string; score: number; bracket: string; city: string };

function readScoreboard(file: string): CsvRow[] {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
  const lines = text.split('\n').filter((l) => l.length > 0);
  if (lines.length < 2) die(`CSV "${file}" has no data rows.`);

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (h: string) => {
    const idx = header.indexOf(h);
    if (idx === -1)
      die(`CSV is missing the "${h}" column. Got: ${header.join(', ')}`);
    return idx;
  };
  const iEmail = col('user email');
  const iScore = col('score');
  const iBracket = col('user bracket name');
  const iCity = col('city');

  return lines.slice(1).map((line) => {
    const f = parseCsvLine(line);
    return {
      email: (f[iEmail] ?? '').toLowerCase(),
      score: Number.parseInt(f[iScore] ?? '', 10),
      bracket: f[iBracket] ?? '',
      city: f[iCity] ?? '',
    };
  });
}

// ─── inlined from xpService (keep in sync) ─────────────────────────────────────
const rewardGrantSourceId = (rewardId: string, talentId: string) =>
  `${rewardId}_${talentId}`;

async function main() {
  console.log(
    `Grant reward "${key}" to ${campusName}: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}${
      force ? ' [--force]' : ''
    }\n`,
  );

  const campus = await prisma.campus.findFirst({
    where: { name: campusName },
    select: { id: true, name: true },
  });
  if (!campus) die(`No campus named "${campusName}".`);

  // Cohort = talents with at least one participation in this campus. Indexed by
  // lower-cased email so the match is case-insensitive against the CTF emails.
  const cohort = await prisma.talent.findMany({
    where: {
      participations: { some: { campusId: campus.id } },
      email: { not: null },
    },
    select: { id: true, email: true, nom: true, prenom: true },
  });
  const byEmail = new Map<string, (typeof cohort)[number]>();
  for (const t of cohort) byEmail.set(t.email!.toLowerCase(), t);

  const rows = readScoreboard(csvPath!);

  const matched: { talentId: string; email: string; amount: number }[] = [];
  const unmatched: string[] = [];
  const skippedOtherCampus: string[] = [];
  const skippedBadScore: string[] = [];

  for (const r of rows) {
    const inCampus =
      r.bracket.toLowerCase() === campus.name.toLowerCase() ||
      r.city.toLowerCase() === campus.name.toLowerCase();
    if (!inCampus) {
      skippedOtherCampus.push(`${r.email} (${r.bracket || r.city || '?'})`);
      continue;
    }
    if (!Number.isFinite(r.score) || r.score <= 0) {
      skippedBadScore.push(`${r.email} (score=${r.score})`);
      continue;
    }
    const t = byEmail.get(r.email);
    if (!t) {
      unmatched.push(r.email);
      continue;
    }
    matched.push({ talentId: t.id, email: r.email, amount: r.score });
  }

  const totalXp = matched.reduce((s, m) => s + m.amount, 0);

  console.log(`Campus cohort:        ${cohort.length} talents`);
  console.log(`CSV rows:             ${rows.length}`);
  console.log(`Skipped (other campus): ${skippedOtherCampus.length}`);
  console.log(`Skipped (bad score):  ${skippedBadScore.length}`);
  console.log(`Matched:              ${matched.length}`);
  console.log(`Unmatched (no talent): ${unmatched.length}`);
  console.log(`Total XP to grant:    ${totalXp}\n`);

  if (skippedOtherCampus.length) {
    console.log(
      `Other-campus rows skipped:\n  ${skippedOtherCampus.join('\n  ')}\n`,
    );
  }
  if (skippedBadScore.length) {
    console.log(`Bad-score rows skipped:\n  ${skippedBadScore.join('\n  ')}\n`);
  }
  if (unmatched.length) {
    console.log(
      `Unmatched emails (no Jump talent in ${campus.name}, reconcile by hand):\n  ${unmatched.join('\n  ')}\n`,
    );
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
    update: { name: name!, campusId: campus.id, awardedOn },
    create: {
      key: key!,
      name: name!,
      xpAmount: null,
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
            sourceId: rewardGrantSourceId(reward.id, m.talentId),
          },
        },
        update: { amount: m.amount, campusId: campus.id },
        create: {
          talentId: m.talentId,
          source: 'reward',
          sourceId: rewardGrantSourceId(reward.id, m.talentId),
          amount: m.amount,
          campusId: campus.id,
        },
      });
      // recompute Talent.xp = SUM(XpGrant.amount), inlined from xpService.
      const agg = await tx.xpGrant.aggregate({
        where: { talentId: m.talentId },
        _sum: { amount: true },
      });
      await tx.talent.update({
        where: { id: m.talentId },
        data: { xp: agg._sum.amount ?? 0 },
      });
    });
    written++;
  }

  console.log(`Done. ${written} talents credited for "${reward.id}" (${key}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
