/**
 * Skip the onboarding flow for an existing talent.
 *
 * Sets all the timestamps that the route guards check before letting a talent
 * reach the dashboard:
 * - infoValidatedAt   (onboarding form)
 * - rulesSignedAt     (règlement signature)
 * - charterAcceptedAt (charte RGPD)
 * - welcomeSeenAt     (welcome page for stage_seconde)
 * - imageRightsDecision + imageRightsDecidedAt + signer prénom/nom (parent flow),
 *   plus the matching ImageRightsDecisionRecord ledger fact
 *
 * After running, the talent can log in and land directly on the dashboard.
 *
 * Run: bun run scripts/skip-onboarding.ts
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
  const email = (await ask('Email du talent : ')).toLowerCase().trim();
  if (!email.includes('@')) {
    console.error('Email invalide.');
    process.exit(1);
  }

  const talent = await prisma.talent.findFirst({ where: { user: { email } } });
  if (!talent) {
    console.error(`Aucun talent trouvé pour ${email}.`);
    process.exit(1);
  }

  const now = new Date();
  const signerPrenom =
    talent.imageRightsSignerPrenom ?? talent.parentPrenom ?? 'Parent';
  const signerNom = talent.imageRightsSignerNom ?? talent.parentNom ?? 'Test';
  const updated = await prisma.talent.update({
    where: { id: talent.id },
    data: {
      infoValidatedAt: now,
      rulesSignedAt: now,
      charterAcceptedAt: now,
      welcomeSeenAt: now,
      imageRightsDecision: 'accepted',
      imageRightsDecidedAt: now,
      imageRightsSignerPrenom: signerPrenom,
      imageRightsSignerNom: signerNom,
      // Append the matching ledger fact so the projection isn't orphaned (the
      // staff history view reads the records, not the projection columns).
      imageRightsRecords: {
        create: {
          decision: 'accepted',
          decidedAt: now,
          signerPrenom,
          signerNom,
          source: 'parent_portal',
        },
      },
    },
  });

  console.log(`\n✓ Onboarding skippé pour ${email}`);
  console.log(
    `  - infoValidatedAt:     ${updated.infoValidatedAt?.toISOString()}`,
  );
  console.log(
    `  - rulesSignedAt:       ${updated.rulesSignedAt?.toISOString()}`,
  );
  console.log(
    `  - charterAcceptedAt:   ${updated.charterAcceptedAt?.toISOString()}`,
  );
  console.log(
    `  - welcomeSeenAt:       ${updated.welcomeSeenAt?.toISOString()}`,
  );
  console.log(
    `  - imageRightsDecision:  ${updated.imageRightsDecision} @ ${updated.imageRightsDecidedAt?.toISOString()}`,
  );
  console.log(
    `  - imageRightsSigner:    ${updated.imageRightsSignerPrenom} ${updated.imageRightsSignerNom}`,
  );
}

main()
  .catch((e) => {
    console.error('Échec :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
