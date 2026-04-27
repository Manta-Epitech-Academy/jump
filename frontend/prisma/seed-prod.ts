/**
 * Minimal production seed — creates the first admin user.
 *
 * Idempotent: if a StaffProfile with staffRole='admin' already exists,
 * the script exits cleanly without changes.
 *
 * Prompts interactively for email + password (password is masked, asked twice).
 *
 * Required env: DATABASE_URL
 * Run: bun run prisma/seed-prod.ts
 */

import path from 'node:path';
import * as readline from 'node:readline';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CTRL_C = String.fromCharCode(3);
const CTRL_D = String.fromCharCode(4);
const DEL = String.fromCharCode(127);

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

function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY) {
      reject(new Error('Hidden prompt requires a TTY.'));
      return;
    }
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (key: string) => {
      if (key === '\r' || key === '\n' || key === CTRL_D) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(value);
        return;
      }
      if (key === CTRL_C) {
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write('\n');
        process.exit(130);
      }
      if (key === DEL || key === '\b') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write('\b \b');
        }
        return;
      }
      value += key;
      stdout.write('*');
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const existingAdmin = await prisma.staffProfile.findFirst({
    where: { staffRole: 'admin' },
    include: { user: { select: { email: true } } },
  });
  if (existingAdmin) {
    console.log(
      `✓ Admin already provisioned (${existingAdmin.user.email}). Nothing to do.`,
    );
    return;
  }

  const email = (await ask('Admin email: ')).toLowerCase().trim();
  if (!email.includes('@')) {
    console.error('Invalid email.');
    process.exit(1);
  }

  const conflict = await prisma.bauth_user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (conflict) {
    console.error(
      `User with email ${email} already exists but is not admin. ` +
        `Refusing to mutate — promote them manually or pick another email.`,
    );
    process.exit(1);
  }

  const password = await askHidden('Password (min 12 chars): ');
  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }
  const confirm = await askHidden('Confirm password: ');
  if (password !== confirm) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  const hashed = await Bun.password.hash(password, {
    algorithm: 'argon2id',
    memoryCost: 19456,
    timeCost: 2,
  });

  await prisma.$transaction(async (tx) => {
    const user = await tx.bauth_user.create({
      data: {
        email,
        name: 'Admin',
        role: 'admin',
        emailVerified: true,
      },
    });
    await tx.staffProfile.create({
      data: { userId: user.id, staffRole: 'admin' },
    });
    await tx.bauth_account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: hashed,
      },
    });
  });

  console.log(`✓ First admin created: ${email}`);
}

main()
  .catch((e) => {
    console.error('Prod seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
