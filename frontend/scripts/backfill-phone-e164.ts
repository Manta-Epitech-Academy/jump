/**
 * Backfill every stored phone column to canonical E.164 ("+33765719823").
 *
 * Phones used to be stored in whatever shape they arrived in: full E.164 or a
 * bare national number from Salesforce ("765719823"), French national from
 * onboarding ("06 12 …"). The sync now normalizes SF phones at ingest and the
 * onboarding input submits E.164, but rows written before that change still
 * carry mixed shapes. That mismatch makes the same number prefill differently
 * in the onboarding input and false-conflicts in the SF reconciliation. This
 * one-off rewrites the existing rows to the canonical form so everything lines
 * up.
 *
 * Columns: Talent.{phone, parentPhone, parent2Phone} and TalentSfImport.phone.
 *
 * Idempotent: a value already in E.164 normalizes to itself, so re-running is a
 * no-op. Values that don't parse (genuine junk) are left untouched and reported
 * rather than blanked — we never lose data we can't confidently rewrite.
 *
 * Run: bun run scripts/backfill-phone-e164.ts [--dry-run]
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { normalizePhoneToE164 } from '../src/lib/domain/phone';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const dryRun = process.argv.includes('--dry-run');

type Stat = { changed: number; unparseable: number; alreadyCanonical: number };
const blank = (): Stat => ({
  changed: 0,
  unparseable: 0,
  alreadyCanonical: 0,
});

// Classify a raw value against its canonical form. Returns the rewrite when one
// is needed, null otherwise; bumps the matching counter as a side effect.
function plan(raw: string | null, stat: Stat): string | null {
  if (!raw || raw.trim().length === 0) return null;
  const canon = normalizePhoneToE164(raw);
  if (!canon) {
    stat.unparseable += 1;
    console.log(`  unparseable, left as-is: ${JSON.stringify(raw)}`);
    return null;
  }
  if (canon === raw) {
    stat.alreadyCanonical += 1;
    return null;
  }
  stat.changed += 1;
  return canon;
}

async function main() {
  console.log(
    `Phone E.164 backfill — ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n`,
  );

  const talentStats = {
    phone: blank(),
    parentPhone: blank(),
    parent2Phone: blank(),
  };
  const mirrorStat = blank();

  const talents = await prisma.talent.findMany({
    select: { id: true, phone: true, parentPhone: true, parent2Phone: true },
  });

  for (const t of talents) {
    const data: {
      phone?: string;
      parentPhone?: string;
      parent2Phone?: string;
    } = {};
    const nextPhone = plan(t.phone, talentStats.phone);
    const nextParent = plan(t.parentPhone, talentStats.parentPhone);
    const nextParent2 = plan(t.parent2Phone, talentStats.parent2Phone);
    if (nextPhone !== null) data.phone = nextPhone;
    if (nextParent !== null) data.parentPhone = nextParent;
    if (nextParent2 !== null) data.parent2Phone = nextParent2;

    if (Object.keys(data).length > 0 && !dryRun) {
      await prisma.talent.update({ where: { id: t.id }, data });
    }
  }

  const mirrors = await prisma.talentSfImport.findMany({
    select: { talentId: true, phone: true },
  });

  for (const m of mirrors) {
    const next = plan(m.phone, mirrorStat);
    if (next !== null && !dryRun) {
      await prisma.talentSfImport.update({
        where: { talentId: m.talentId },
        data: { phone: next },
      });
    }
  }

  const report = (label: string, s: Stat) =>
    console.log(
      `  ${label.padEnd(24)} rewritten=${s.changed}  already-E164=${s.alreadyCanonical}  unparseable=${s.unparseable}`,
    );

  console.log(
    `\nScanned ${talents.length} talents, ${mirrors.length} SF mirrors.\n`,
  );
  report('Talent.phone', talentStats.phone);
  report('Talent.parentPhone', talentStats.parentPhone);
  report('Talent.parent2Phone', talentStats.parent2Phone);
  report('TalentSfImport.phone', mirrorStat);

  console.log(dryRun ? '\nDRY RUN — no rows written.' : '\nDone.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
