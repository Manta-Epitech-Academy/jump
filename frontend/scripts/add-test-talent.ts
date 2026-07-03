/**
 * Add a test talent with incomplete onboarding.
 *
 * Creates a talent with:
 * - infoValidatedAt set (student info done)
 * - rulesSignedAt NULL (règlement not signed)
 * - imageRightsDecision NULL (droit à l'image undecided)
 * - parentEmail set to the provided email (exercises the parent flow)
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

  // Find the active stage_seconde event on Paris campus
  const now = new Date();
  const lookaheadDays = 60;
  const lookahead = new Date(now);
  lookahead.setDate(lookahead.getDate() + lookaheadDays);
  const defaultDuration = 14;
  const implicitLookback = new Date(now);
  implicitLookback.setDate(implicitLookback.getDate() - defaultDuration);

  let event = await prisma.event.findFirst({
    where: {
      campusId: paris.id,
      eventType: 'stage_seconde',
      date: { lte: lookahead },
      OR: [
        { endDate: { gte: now } },
        { endDate: null, date: { gte: implicitLookback } },
      ],
    },
    select: { id: true, titre: true },
    orderBy: { date: 'asc' },
  });

  if (!event) {
    // Fallback: create a stage_seconde event starting today
    event = await prisma.event.create({
      data: {
        titre: 'Stage de Seconde – Test',
        eventType: 'stage_seconde',
        date: now,
        endDate: new Date(now.getTime() + defaultDuration * 86_400_000),
        campusId: paris.id,
      },
      select: { id: true, titre: true },
    });
    console.log(`  Created test stage event: ${event.titre}`);
  } else {
    console.log(`  Using existing stage event: ${event.titre}`);
  }

  // Create or update the test talent
  const talent = await prisma.talent.upsert({
    where: { email },
    update: {
      infoValidatedAt: new Date(),
      rulesSignedAt: null,
      charterAcceptedAt: null,
      imageRightsDecision: null,
      imageRightsDecidedAt: null,
      parentEmail: email,
      parentNom: 'Test',
      parentPrenom: 'Parent',
    },
    create: {
      email,
      nom: 'Test',
      prenom: 'Talent',
      niveau: '3eme',
      infoValidatedAt: new Date(),
      rulesSignedAt: null,
      charterAcceptedAt: null,
      imageRightsDecision: null,
      imageRightsDecidedAt: null,
      parentEmail: email,
      parentNom: 'Test',
      parentPrenom: 'Parent',
      parentPhone: '0600000000',
    },
  });

  // Ensure participation exists on this specific stage event
  const existingParticipation = await prisma.participation.findFirst({
    where: { talentId: talent.id, eventId: event.id },
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
  console.log(`  - imageRightsDecision: ❌ (undecided)`);
  console.log(`  - parentEmail: ${email}`);
  console.log(`  - Campus: Paris (via participation on stage: ${event.titre})`);
}

main()
  .catch((e) => {
    console.error('Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
