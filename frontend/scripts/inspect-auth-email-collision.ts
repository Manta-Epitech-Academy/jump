/**
 * Diagnose a single auth-email collision left behind by backfill-auth-email.ts.
 *
 * Given a drifted talent (Talent.email ≠ linked bauth_user.email), print:
 *   - the linked account (current login identity, stale email);
 *   - the account that already holds Talent.email, and a VERDICT for what it is
 *     (orphan / another talent + symmetric? / parent / staff) — the forward
 *     direction, which decides the safe resolution;
 *   - WHO OWNS THE STALE EMAIL the linked account squats (e.g. melco1508) — the
 *     backward direction. If it is a real, loggable identity, that person
 *     logging in lands on THIS talent's dashboard: a cross-account exposure
 *     (minors → RGPD).
 *
 * Verdict vocabulary is kept identical to
 * `src/lib/server/services/authIdentityService.ts` (which powers the admin UI):
 * the script is standalone (own PrismaClient, runnable in the prod container)
 * by repo convention, so the rules are mirrored here rather than imported.
 *
 * Read-only, writes nothing.
 *
 * Run: bun run scripts/inspect-auth-email-collision.ts <talentId>
 *   (defaults to the known case if no id is passed)
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const talentId = process.argv[2] ?? 'cmp3zarym04ww01l6c5i9j9i2';

const norm = (e: string | null | undefined): string | null =>
  e?.toLowerCase().trim() || null;

const userView = {
  id: true,
  email: true,
  name: true,
  role: true,
  banned: true,
  createdAt: true,
  _count: { select: { sessions: true, accounts: true } },
  accounts: { select: { providerId: true } },
  staffProfile: { select: { id: true } },
  talent: {
    select: {
      id: true,
      prenom: true,
      nom: true,
      externalId: true,
      email: true,
    },
  },
} as const;

async function main() {
  const talent = await prisma.talent.findUnique({
    where: { id: talentId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      externalId: true,
      user: { select: userView },
    },
  });

  if (!talent) {
    console.log(`No talent with id ${talentId}`);
    return;
  }

  console.log(`\nTALENT  ${talent.id}  (${talent.prenom} ${talent.nom})`);
  console.log(`  externalId : ${talent.externalId ?? '—'}`);
  console.log(`  Talent.email (Salesforce, current) : ${talent.email}`);

  console.log(`\nLINKED AUTH ACCOUNT (current login identity, stale):`);
  if (talent.user) printUser(talent.user);
  else {
    console.log('  (none — talent has no userId)');
    return;
  }

  if (!talent.email) {
    console.log('\nTalent has no email — nothing to collide with.');
    return;
  }

  const targetEmail = norm(talent.email)!;
  const staleEmail = norm(talent.user.email)!;

  if (targetEmail === staleEmail) {
    console.log('\n→ Link is already aligned (no conflict). Nothing to do.');
    return;
  }

  // ── Forward: who holds Talent.email → the verdict. ──────────────────────
  const holder = await prisma.bauth_user.findFirst({
    where: { email: { equals: targetEmail, mode: 'insensitive' } },
    select: userView,
  });

  console.log(`\nACCOUNT ALREADY HOLDING "${talent.email}" (forward):`);
  if (!holder) {
    console.log('  (none)');
  } else {
    printUser(holder);
  }

  let verdict: string;
  if (!holder) {
    verdict =
      'SIMPLE_DRIFT — nobody holds the target email; the linked account can simply be renamed to it (backfill).';
  } else if (holder.staffProfile) {
    verdict =
      'STAFF_HOLDER — held by a STAFF account. SF data anomaly, escalate, never force.';
  } else if (holder.role === 'parent' || (await isParentEmail(targetEmail))) {
    verdict =
      'PARENT_HOLDER — held by a PARENT login. A student cannot log in with a parent email. SF anomaly, escalate.';
  } else if (holder.talent) {
    const symmetric = norm(holder.talent.email) === staleEmail;
    verdict = symmetric
      ? `SYMMETRIC_INVERSION — held by another talent (${holder.talent.prenom} ${holder.talent.nom}, id=${holder.talent.id}) whose own email is exactly the stale one. Clean two-sided swap.`
      : `DEGRADED_INVERSION — held by another talent (${holder.talent.prenom} ${holder.talent.nom}, id=${holder.talent.id}) but NOT symmetric. No automatic move is safe; two-sided manual care.`;
  } else {
    verdict =
      'ORPHAN_HOLDER — held by an account with no talent/staff/parent link. Repoint the talent onto it (the live sessions are there) and drop the stale account.';
  }

  // ── Backward: who really owns the stale email the linked account squats. ──
  console.log(`\nWHO OWNS THE STALE EMAIL "${talent.user.email}" (backward):`);
  const staleStaff = await prisma.bauth_user.findFirst({
    where: {
      email: { equals: staleEmail, mode: 'insensitive' },
      staffProfile: { isNot: null },
    },
    select: { id: true },
  });
  const staleAsOtherTalent = await prisma.talent.findFirst({
    where: {
      id: { not: talent.id },
      email: { equals: staleEmail, mode: 'insensitive' },
    },
    select: { id: true, prenom: true, nom: true },
  });
  const staleAsParentOf = await prisma.talent.findFirst({
    where: {
      OR: [
        { parentEmail: { equals: staleEmail, mode: 'insensitive' } },
        { parent2Email: { equals: staleEmail, mode: 'insensitive' } },
      ],
    },
    select: { id: true, prenom: true, nom: true },
  });

  let exposure: string;
  if (staleStaff) {
    exposure =
      '⚠ EXPOSURE (staff) — the stale email is a STAFF email. That staff logging in would land on this talent. Close the link first.';
  } else if (staleAsParentOf) {
    exposure = `⚠ EXPOSURE (parent) — the stale email is the parent email of ${staleAsParentOf.prenom} ${staleAsParentOf.nom} (talent id=${staleAsParentOf.id}). That parent logging in would land on this talent.`;
  } else if (staleAsOtherTalent) {
    exposure = `⚠ EXPOSURE (talent) — the stale email legitimately belongs to ${staleAsOtherTalent.prenom} ${staleAsOtherTalent.nom} (talent id=${staleAsOtherTalent.id}). They would land on THIS talent's dashboard.`;
  } else {
    exposure =
      'No exposure — the stale email belongs to no other talent/parent/staff (just a wrong value).';
  }
  console.log(`  ${exposure}`);

  console.log(`\n→ VERDICT: ${verdict}`);
}

async function isParentEmail(email: string): Promise<boolean> {
  const t = await prisma.talent.findFirst({
    where: {
      OR: [
        { parentEmail: { equals: email, mode: 'insensitive' } },
        { parent2Email: { equals: email, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  return t !== null;
}

function printUser(u: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  banned: boolean | null;
  createdAt: Date;
  _count: { sessions: number; accounts: number };
  accounts: { providerId: string }[];
}) {
  console.log(`  id        : ${u.id}`);
  console.log(`  email     : ${u.email}`);
  console.log(`  name/role : ${u.name ?? '—'} / ${u.role}`);
  console.log(`  createdAt : ${u.createdAt.toISOString()}`);
  console.log(`  banned    : ${u.banned ?? false}`);
  console.log(
    `  sessions  : ${u._count.sessions}   accounts: ${u._count.accounts} [${u.accounts.map((a) => a.providerId).join(', ') || 'none'}]`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
