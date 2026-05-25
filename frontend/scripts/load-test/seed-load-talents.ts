/**
 * Seeds N talents with all onboarding gates set EXCEPT rulesSignedAt, so
 * signature-burst.js can POST signRules on each one and observe the
 * OnboardingPdfJob queue under load.
 *
 *   COUNT=500 bun scripts/load-test/seed-load-talents.ts        (from frontend/)
 *
 * Idempotent: re-running upserts each row + resets rulesSignedAt to null on
 * existing load-test talents (so a previous run's signed state doesn't block
 * the next signature burst). Run `cleanup.ts` to remove them entirely.
 *
 * Talents are tagged with `@loadtest.invalid` so they can never collide with
 * real users and are trivially purgeable.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const COUNT = Number(process.env.COUNT ?? 100);
const DOMAIN = '@loadtest.invalid';

const NOW = new Date();

async function main() {
  // Resolve a campus to attach the seeded talents to (most-recent, doesn't
  // matter which — they only need to exist).
  const campus = await prisma.campus.findFirst({ select: { id: true } });
  if (!campus) throw new Error('No campus in DB — seed cannot run');

  console.log(`Seeding ${COUNT} load-test talents under ${DOMAIN}…`);

  let created = 0;
  let reset = 0;
  for (let i = 1; i <= COUNT; i++) {
    const email = `load-test-${String(i).padStart(4, '0')}${DOMAIN}`;

    const user = await prisma.bauth_user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        emailVerified: true,
        role: 'student',
        name: `Load Test ${i}`,
      },
      select: { id: true },
    });

    const existing = await prisma.talent.findUnique({
      where: { userId: user.id },
      select: { id: true, rulesSignedAt: true },
    });

    const fields = {
      userId: user.id,
      email,
      nom: `LoadTest${i}`,
      prenom: 'Test',
      civilite: 'Mr' as const,
      phone: '0600000000',
      parentType: 'parent1',
      parentCivilite: 'Mme',
      parentNom: `LoadTestParent${i}`,
      parentPrenom: 'P',
      parentEmail: `load-test-parent-${i}@loadtest.invalid`,
      parentPhone: '0600000001',
      highSchoolNameManual: 'Lycée Load Test',
      infoValidatedAt: NOW,
      highSchoolValidatedAt: NOW,
      parentsValidatedAt: NOW,
      techInterestsValidatedAt: NOW,
      generalInterestsValidatedAt: NOW,
      interestsRecapSeenAt: NOW,
      equipmentValidatedAt: NOW,
      processingCompletedAt: NOW,
      hasLaptop: true,
      // rulesSignedAt + charterAcceptedAt left null so signRules can fire.
      rulesSignedAt: null,
      charterAcceptedAt: null,
      welcomeSeenAt: null,
    };

    if (existing) {
      await prisma.talent.update({ where: { id: existing.id }, data: fields });
      // Also wipe any leftover signature / PDF job from a previous run.
      if (existing.rulesSignedAt) reset++;
      await prisma.onboardingPdfJob.deleteMany({
        where: { talentId: existing.id },
      });
    } else {
      await prisma.talent.create({ data: fields });
      created++;
    }

    if (i % 50 === 0) console.log(`  …${i}/${COUNT}`);
  }

  console.log(
    `✓ ${created} new, ${reset} reset, ${COUNT - created - reset} unchanged`,
  );
  console.log(
    '  Run `bun load/scripts/manifest.ts` to refresh load/data.json.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
