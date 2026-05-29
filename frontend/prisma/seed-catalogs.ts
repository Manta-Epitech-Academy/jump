import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import {
  seedInterests,
  seedEmailTemplates,
  seedBroadcastTemplates,
} from './catalogs';

// Narrow, idempotent refresh of the two reference catalogs (talent interests
// + default email templates). Upserts in place, so it is safe to re-run against
// a populated prod DB: it refreshes the seeded defaults without touching student
// interest selections (`TalentInterest`) or admin-authored broadcast templates.
// The catalogue data + write logic live in `./catalogs` (the single source of
// truth shared with the full `seed.ts`); this script only resolves the template
// author. Use to refresh the catalogs without rebuilding the whole DB.
//
// Run: `bun run prisma/seed-catalogs.ts`

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('→ Syncing interests…');
  const interestCount = await seedInterests(prisma);
  console.log(`✓  ${interestCount} interests`);

  console.log('→ Syncing email templates…');
  const createdById = await resolveAuthorUserId();
  const templateCount = await seedEmailTemplates(prisma, createdById);
  console.log(`✓  ${templateCount} templates + mappings`);

  console.log('→ Syncing broadcast templates…');
  const broadcastTemplateCount = await seedBroadcastTemplates(
    prisma,
    createdById,
  );
  console.log(`✓  ${broadcastTemplateCount} broadcast templates`);

  console.log('\nDone.');
}

/**
 * Resolve the `MessageTemplate.createdById` author. Defaults to
 * pauline.marchand@epitech.eu (the superdev seeded by the full `seed.ts`),
 * then falls back to any staff user, then any user, so this script works
 * when run before / outside a full seed (e.g. a fresh prod DB whose only
 * users are OAuth-provisioned admins).
 */
async function resolveAuthorUserId(): Promise<string> {
  const preferred = await prisma.bauth_user.findUnique({
    where: { email: 'pauline.marchand@epitech.eu' },
    select: { id: true },
  });
  if (preferred) return preferred.id;

  const anyStaff = await prisma.bauth_user.findFirst({
    where: { staffProfile: { isNot: null } },
    select: { id: true },
  });
  if (anyStaff) return anyStaff.id;

  const anyUser = await prisma.bauth_user.findFirst({ select: { id: true } });
  if (anyUser) return anyUser.id;

  throw new Error(
    'No bauth_user found to author email templates. Run the full seed (`prisma db seed`) at least once, or provision an admin first.',
  );
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
