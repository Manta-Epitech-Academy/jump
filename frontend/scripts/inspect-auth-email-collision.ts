/**
 * Diagnose a single auth-email collision left behind by backfill-auth-email.ts.
 *
 * Given a drifted talent (Talent.email ≠ linked bauth_user.email, and the new
 * email is already taken by ANOTHER bauth_user), print both accounts and what
 * the colliding one actually is — duplicate person, parent, staff, or orphan —
 * so the conflict can be resolved by hand. Read-only, writes nothing.
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
    select: { id: true, prenom: true, nom: true, externalId: true },
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
  else console.log('  (none — talent has no userId)');

  if (!talent.email) {
    console.log('\nTalent has no email — nothing to collide with.');
    return;
  }

  const collider = await prisma.bauth_user.findUnique({
    where: { email: talent.email },
    select: userView,
  });

  console.log(`\nACCOUNT ALREADY HOLDING "${talent.email}":`);
  if (!collider) {
    console.log('  (none — no collision, backfill should succeed now)');
    return;
  }
  printUser(collider);

  // Classify the collider so the resolution path is obvious.
  let kind: string;
  if (collider.talent)
    kind =
      collider.talent.id === talent.id
        ? 'SAME talent (already correctly linked — nothing to do)'
        : `ANOTHER talent (${collider.talent.prenom} ${collider.talent.nom}, id=${collider.talent.id}) — likely a duplicate person`;
  else if (collider.staffProfile) kind = 'a STAFF account';
  else {
    const asParent = await prisma.talent.findFirst({
      where: {
        OR: [{ parentEmail: talent.email }, { parent2Email: talent.email }],
      },
      select: { id: true, prenom: true, nom: true },
    });
    kind = asParent
      ? `a PARENT account (parent of ${asParent.prenom} ${asParent.nom}, talent id=${asParent.id})`
      : 'an ORPHAN account (no talent, no staff, no parent link)';
  }

  console.log(`\n→ The colliding account is ${kind}.`);
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
