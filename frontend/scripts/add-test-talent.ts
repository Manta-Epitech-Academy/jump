/**
 * Add a test talent with incomplete onboarding for testing reminders.
 *
 * Creates a talent with:
 * - infoValidatedAt set (student info done)
 * - rulesSignedAt NULL (règlement not signed)
 * - imageRightsSignedAt NULL (droit à l'image not signed)
 * - parentEmail set to the provided email so both reminder types can be tested
 * - Linked to Paris campus via a Participation on the first available event
 *
 * Run: bun run scripts/add-test-talent.ts
 */

import path from 'node:path';
import * as readline from 'node:readline';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
}

async function main() {
  const email = (await ask('Email for test talent (student + parent): '))
    .toLowerCase()
    .trim();
  if (!email.includes('@')) {
    console.error('Invalid email.');
    process.exit(1);
  }

  // Find Paris campus
  const paris = await prisma.campus.findFirst({ where: { name: 'Paris' } });
  if (!paris) {
    console.error('Campus Paris not found. Run seed first.');
    process.exit(1);
  }

  // Find an event on Paris campus to link participation
  const event = await prisma.event.findFirst({
    where: { campusId: paris.id },
    select: { id: true },
  });
  if (!event) {
    console.error('No event found on Paris campus. Run seed first.');
    process.exit(1);
  }

  // Create or update the test talent
  const talent = await prisma.talent.upsert({
    where: { email },
    update: {
      infoValidatedAt: new Date(),
      rulesSignedAt: null,
      charterAcceptedAt: null,
      imageRightsSignedAt: null,
      parentEmail: email,
      parentNom: 'Test',
      parentPrenom: 'Parent',
    },
    create: {
      email,
      nom: 'Test',
      prenom: 'Talent',
      niveau: '3eme',
      niveauDifficulte: 'Intermédiaire',
      infoValidatedAt: new Date(),
      rulesSignedAt: null,
      charterAcceptedAt: null,
      imageRightsSignedAt: null,
      parentEmail: email,
      parentNom: 'Test',
      parentPrenom: 'Parent',
      parentPhone: '0600000000',
    },
  });

  // Ensure participation exists on Paris campus
  const existingParticipation = await prisma.participation.findFirst({
    where: { talentId: talent.id, campusId: paris.id },
  });

  if (!existingParticipation) {
    await prisma.participation.create({
      data: {
        talentId: talent.id,
        eventId: event.id,
        campusId: paris.id,
      },
    });
  }

  console.log(`\n✓ Test talent added: ${email}`);
  console.log(`  - infoValidatedAt: ✅`);
  console.log(`  - rulesSignedAt: ❌ (missing)`);
  console.log(`  - imageRightsSignedAt: ❌ (missing)`);
  console.log(`  - parentEmail: ${email}`);
  console.log(`  - Campus: Paris (via participation)`);
}

main()
  .catch((e) => {
    console.error('Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
