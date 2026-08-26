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
 * Both the règlement signature and the image-rights decision are per school
 * year, so all of this lands on an `Onboarding_Record` as well as on the talent
 * row it projects onto: writing only the flat columns leaves a state the runtime
 * cannot produce, and the first real wizard step would wipe it.
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

// Mirrors `schoolYearOf` in src/lib/domain/schoolYear.ts: the Epitech school
// year opens on 31 July, so 30 Jul 2026 still belongs to 2025-2026 while
// 31 Jul 2026 opens 2026-2027. Duplicated rather than imported for the same
// reason as in the seed: this script runs standalone, with no $lib resolution.
function currentSchoolYearLabel(at: Date): string {
  const key = at.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  const afterCutoff = month > 7 || (month === 7 && day >= 31);
  const startYear = afterCutoff ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

// Mirrors CURRENT_REGLEMENT_VERSION / CURRENT_DROIT_IMAGE_VERSION in
// src/lib/content. A signature or decision with no version is a state the
// runtime cannot reach and would re-render the legacy wording under it.
const CURRENT_DOCUMENT_VERSION = '2026-2027';

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
  // The dossier this fakes a walk through: the one the talent already has, else
  // the year in progress. Same resolution as `guardianActSchoolYear` server-side.
  const schoolYear = talent.onboardingSchoolYear ?? currentSchoolYearLabel(now);

  // What the walk records, written to the dossier AND mirrored onto the talent
  // as its projection. Both, because either alone is a state the runtime cannot
  // reach: a projection with no dossier row is wiped by the first real wizard
  // step, and a dossier with no projection leaves every guard reading "not
  // started".
  const projected = {
    infoValidatedAt: now,
    rulesSignedAt: now,
    reglementVersion: CURRENT_DOCUMENT_VERSION,
    imageRightsDecision: 'accepted' as const,
    imageRightsDecidedAt: now,
    imageRightsSignerPrenom: signerPrenom,
    imageRightsSignerNom: signerNom,
  };

  await prisma.onboarding_Record.upsert({
    where: { talentId_schoolYear: { talentId: talent.id, schoolYear } },
    create: {
      talentId: talent.id,
      schoolYear,
      ...projected,
      imageRightsVersion: CURRENT_DOCUMENT_VERSION,
    },
    update: { ...projected, imageRightsVersion: CURRENT_DOCUMENT_VERSION },
  });

  const updated = await prisma.talent.update({
    where: { id: talent.id },
    data: {
      ...projected,
      onboardingSchoolYear: schoolYear,
      charterAcceptedAt: now,
      welcomeSeenAt: now,
      // Append the matching ledger fact so the projection isn't orphaned (the
      // staff history view reads the records, not the projection columns), with
      // the year it answers for and the wording it commits to.
      imageRightsRecords: {
        create: {
          schoolYear,
          version: CURRENT_DOCUMENT_VERSION,
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
