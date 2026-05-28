/**
 * Removes everything created by the load-test seeds — bauth_user rows under
 * @loadtest.invalid (cascades to Talent, sessions, XpGrants, etc.).
 *
 *   bun scripts/load-test/cleanup.ts         (from frontend/)
 *
 * Safe to run at any time; idempotent.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const DOMAIN = '@loadtest.invalid';

async function main() {
  const users = await prisma.bauth_user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true },
  });
  console.log(`Found ${users.length} load-test bauth_user rows. Deleting…`);

  // Cascade-deletes Talent + sessions + XpGrants + OnboardingPdfJobs.
  const result = await prisma.bauth_user.deleteMany({
    where: { email: { endsWith: DOMAIN } },
  });

  console.log(`✓ Removed ${result.count} bauth_user rows (cascade).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
