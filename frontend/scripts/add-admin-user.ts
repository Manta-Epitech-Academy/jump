/**
 * Add an admin to the database from an email.
 *
 * Auth happens via Microsoft OAuth — no password is stored.
 * The user logs in with Microsoft; BetterAuth links the account by email,
 * and the staff oauth callback finds the pre-provisioned StaffProfile.
 *
 * Required env: DATABASE_URL
 * Run: bun run scripts/add-admin-user.ts
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
  const email = (await ask('Admin email: ')).toLowerCase().trim();
  if (!email.includes('@')) {
    console.error('Invalid email.');
    process.exit(1);
  }
  // Staff OAuth callback (staff/oauth/callback/+server.ts) deletes any
  // bauth_user whose email is not @epitech.eu on first login. Fail here
  // instead of letting that happen later.
  if (!email.endsWith('@epitech.eu')) {
    console.error('Email must be @epitech.eu (staff OAuth restriction).');
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.bauth_user.upsert({
      where: { email },
      update: { role: 'admin', emailVerified: true },
      create: {
        email,
        name: 'Admin',
        role: 'admin',
        emailVerified: true,
      },
    });
    await tx.staffProfile.upsert({
      where: { userId: user.id },
      update: { staffRole: 'admin' },
      create: { userId: user.id, staffRole: 'admin' },
    });
  });

  console.log(`✓ Admin added: ${email}`);
}

main()
  .catch((e) => {
    console.error('Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
