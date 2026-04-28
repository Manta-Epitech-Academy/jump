/**
 * Manually accept a pending StaffInvitation for the given email.
 *
 * Mirrors the OAuth callback flow (staff/oauth/callback/+server.ts) without
 * requiring the user to actually go through Microsoft OAuth. Useful when:
 *   - the user can't log in (account_not_linked, OAuth misconfig)
 *   - bootstrapping environments where the OAuth callback is unavailable
 *
 * Effect:
 *   - finds the StaffInvitation by email
 *   - upserts the bauth_user (email, role, emailVerified)
 *   - upserts the StaffProfile with the invitation's campusId + staffRole
 *   - deletes the consumed invitation
 *
 * Required env: DATABASE_URL
 * Run: bun run scripts/accept-invitation.ts
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
  const email = (await ask('Email of the invitee: ')).toLowerCase().trim();
  if (!email.includes('@')) {
    console.error('Invalid email.');
    process.exit(1);
  }

  const invitation = await prisma.staffInvitation.findUnique({
    where: { email },
    include: { campus: true },
  });

  if (!invitation) {
    console.error(`No pending invitation found for ${email}.`);
    process.exit(1);
  }

  const bauthRole = invitation.staffRole === 'admin' ? 'admin' : 'staff';

  await prisma.$transaction(async (tx) => {
    const user = await tx.bauth_user.upsert({
      where: { email },
      update: { role: bauthRole, emailVerified: true },
      create: {
        email,
        name: email.split('@')[0],
        role: bauthRole,
        emailVerified: true,
      },
    });

    await tx.staffProfile.upsert({
      where: { userId: user.id },
      update: {
        campusId: invitation.campusId,
        staffRole: invitation.staffRole,
      },
      create: {
        userId: user.id,
        campusId: invitation.campusId,
        staffRole: invitation.staffRole,
      },
    });

    await tx.staffInvitation.delete({ where: { email } });
  });

  console.log(
    `✓ Invitation accepted for ${email} (${invitation.staffRole}${
      invitation.campus ? ` @ ${invitation.campus.name}` : ''
    }).`,
  );
}

main()
  .catch((e) => {
    console.error('Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
