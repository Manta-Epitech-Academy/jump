/**
 * Repair `Talent.lastActiveAt` rows polluted by admin impersonation.
 *
 * Before the impersonation guard landed (`hooks.server.ts`), every request made
 * while an admin impersonated a talent stamped that talent's `lastActiveAt`. A
 * talent who never logged in themselves but was impersonated once therefore
 * shows a recent "dernière connexion" while "première connexion" reads "Jamais"
 * (the fiche filters impersonation sessions out). That mismatch is the bug this
 * one-off undoes.
 *
 * Fix: null `lastActiveAt` for every talent whose user has NO real (non
 * -impersonation) `bauth_session` — i.e. they never genuinely logged in, so they
 * were never active. Talents with a real session are left untouched; their
 * `lastActiveAt` is approximately right and self-heals on their next visit.
 *
 * Idempotent: re-running finds nothing once repaired. Run the guard deploy first
 * so no new pollution races this.
 *
 * Run: bun run scripts/repair-impersonation-last-active.ts [--dry-run]
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(
    `lastActiveAt impersonation repair — ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n`,
  );

  // Only rows that carry a value can be polluted; probe one real session each.
  const talents = await prisma.talent.findMany({
    where: { lastActiveAt: { not: null } },
    select: {
      id: true,
      nom: true,
      prenom: true,
      lastActiveAt: true,
      user: {
        select: {
          sessions: {
            where: { impersonatedBy: null },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });

  // Never genuinely logged in (no real session) yet carries a lastActiveAt:
  // that value can only have come from impersonation.
  const stale = talents.filter((t) => (t.user?.sessions.length ?? 0) === 0);

  console.log(
    `Talents with lastActiveAt set: ${talents.length} | to clear (no real session): ${stale.length}`,
  );
  for (const t of stale) {
    console.log(
      `  ${t.id}  ${t.prenom} ${t.nom}  lastActiveAt=${t.lastActiveAt?.toISOString()} → null`,
    );
  }

  if (dryRun) {
    console.log('\nDRY RUN — no rows written.');
    return;
  }

  if (stale.length === 0) {
    console.log('\nNothing to repair.');
    return;
  }

  const { count } = await prisma.talent.updateMany({
    where: { id: { in: stale.map((t) => t.id) } },
    data: { lastActiveAt: null },
  });
  console.log(`\nCleared lastActiveAt on ${count} talent(s). Done.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
