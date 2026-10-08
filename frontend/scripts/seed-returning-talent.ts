import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SignJWT } from 'jose';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function mintToken(email: string, talentId: string, secret: string) {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ talent_id: talentId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('jump')
    .setAudience('jump:fastlogin')
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30)
    .sign(key);
}

async function main() {
  const email = 'leo.dupont@seed.invalid';
  const talentId = 'sd_tal_returning_leo';
  const userId = 'usr_tal_returning_leo';

  console.log(
    'Seeding returning talent (dossier validé en 2025-2026, à refaire en 2026-2027)...',
  );

  // 1. Create/upsert bauth_user
  const user = await prisma.bauth_user.upsert({
    where: { email },
    create: {
      id: userId,
      email,
      name: 'Léo Dupont',
      role: 'student',
      emailVerified: true,
      createdAt: new Date('2025-10-01T10:00:00Z'),
    },
    update: {
      name: 'Léo Dupont',
      role: 'student',
      emailVerified: true,
    },
  });

  const lastYearDate = new Date('2025-10-15T14:30:00Z');

  // 2. Create/upsert Talent
  // All onboarding columns represent the most recent completed dossier (2025-2026)
  const talent = await prisma.talent.upsert({
    where: { id: talentId },
    create: {
      id: talentId,
      user: { connect: { id: user.id } },
      prenom: 'Léo',
      nom: 'Dupont (Revenant)',
      phone: '+33612345678',
      civilite: 'M',
      niveau: '1ere',
      school: { connect: { id: 'sd_sch_0751000a' } }, // Lycée Marie Curie (Paris)
      parentEmail: 'parent.dupont@seed.invalid',
      parentPrenom: 'Jean',
      parentNom: 'Dupont',
      parentPhone: '+33698765432',
      parentType: 'pere',
      parentCivilite: 'M',
      // Account-level flags (survive across years)
      charterAcceptedAt: lastYearDate,
      welcomeSeenAt: lastYearDate,
      firstLoginAt: lastYearDate,
      lastActiveAt: new Date(),
      // Stamp of the last completed dossier
      onboardingSchoolYear: '2025-2026',
      // Projected fields from 2025-2026 dossier
      infoValidatedAt: lastYearDate,
      highSchoolValidatedAt: lastYearDate,
      parentsValidatedAt: lastYearDate,
      techInterestsValidatedAt: lastYearDate,
      generalInterestsValidatedAt: lastYearDate,
      equipmentValidatedAt: lastYearDate,
      processingCompletedAt: lastYearDate,
      rulesSignedAt: lastYearDate,
      rulesSignedCity: 'Paris',
      reglementVersion: '2025-01',
      parentRulesSignedAt: lastYearDate,
      parentRulesSignerPrenom: 'Jean',
      parentRulesSignerNom: 'Dupont',
      parentRulesRelationship: 'pere',
      parentRulesSignedCity: 'Paris',
      imageRightsDecision: 'accepted',
      imageRightsDecidedAt: lastYearDate,
      imageRightsSignerPrenom: 'Jean',
      imageRightsSignerNom: 'Dupont',
    },
    update: {
      user: { connect: { id: user.id } },
      prenom: 'Léo',
      nom: 'Dupont (Revenant)',
      niveau: '1ere',
      school: { connect: { id: 'sd_sch_0751000a' } },
      charterAcceptedAt: lastYearDate,
      welcomeSeenAt: lastYearDate,
      onboardingSchoolYear: '2025-2026',
      infoValidatedAt: lastYearDate,
      highSchoolValidatedAt: lastYearDate,
      parentsValidatedAt: lastYearDate,
      techInterestsValidatedAt: lastYearDate,
      generalInterestsValidatedAt: lastYearDate,
      equipmentValidatedAt: lastYearDate,
      processingCompletedAt: lastYearDate,
      rulesSignedAt: lastYearDate,
      rulesSignedCity: 'Paris',
      reglementVersion: '2025-01',
      parentRulesSignedAt: lastYearDate,
      parentRulesSignerPrenom: 'Jean',
      parentRulesSignerNom: 'Dupont',
      parentRulesRelationship: 'pere',
      parentRulesSignedCity: 'Paris',
      imageRightsDecision: 'accepted',
      imageRightsDecidedAt: lastYearDate,
    },
  });

  // 3. Clear any 2026-2027 Onboarding_Record if it existed
  await prisma.onboarding_Record.deleteMany({
    where: { talentId: talent.id, schoolYear: '2026-2027' },
  });

  // 4. Create/upsert Onboarding_Record for 2025-2026 (completed last year)
  await prisma.onboarding_Record.upsert({
    where: {
      talentId_schoolYear: { talentId: talent.id, schoolYear: '2025-2026' },
    },
    create: {
      talentId: talent.id,
      schoolYear: '2025-2026',
      infoValidatedAt: lastYearDate,
      highSchoolValidatedAt: lastYearDate,
      parentsValidatedAt: lastYearDate,
      techInterestsValidatedAt: lastYearDate,
      generalInterestsValidatedAt: lastYearDate,
      equipmentValidatedAt: lastYearDate,
      processingCompletedAt: lastYearDate,
      rulesSignedAt: lastYearDate,
      rulesSignedCity: 'Paris',
      reglementVersion: '2025-01',
      rulesFilePath: `documents/${talent.id}/reglement-2025-2026.pdf`,
      parentRulesSignedAt: lastYearDate,
      parentRulesSignerPrenom: 'Jean',
      parentRulesSignerNom: 'Dupont',
      parentRulesRelationship: 'pere',
      parentRulesSignedCity: 'Paris',
      imageRightsDecision: 'accepted',
      imageRightsDecidedAt: lastYearDate,
      imageRightsSignerPrenom: 'Jean',
      imageRightsSignerNom: 'Dupont',
      imageRightsRelationship: 'pere',
      imageRightsSignedCity: 'Paris',
      imageRightsVersion: '2025-01',
      imageRightsFilePath: `documents/${talent.id}/image-rights-2025-2026.pdf`,
      createdAt: lastYearDate,
      updatedAt: lastYearDate,
    },
    update: {
      rulesSignedAt: lastYearDate,
      parentRulesSignedAt: lastYearDate,
      imageRightsDecidedAt: lastYearDate,
    },
  });

  // 5. Create ImageRightsDecisionRecord for 2025-2026
  const existingDecision = await prisma.imageRightsDecisionRecord.findFirst({
    where: { talentId: talent.id, schoolYear: '2025-2026' },
  });
  if (!existingDecision) {
    await prisma.imageRightsDecisionRecord.create({
      data: {
        talentId: talent.id,
        decision: 'accepted',
        schoolYear: '2025-2026',
        version: '2025-01',
        decidedAt: lastYearDate,
        signerPrenom: 'Jean',
        signerNom: 'Dupont',
        relationship: 'pere',
        city: 'Paris',
        source: 'parent_portal',
        createdAt: lastYearDate,
      },
    });
  }

  // 6. Schooling records for 2025-2026 and 2026-2027
  await prisma.schooling_YearRecord.upsert({
    where: {
      talentId_schoolYear: { talentId: talent.id, schoolYear: '2025-2026' },
    },
    create: {
      talentId: talent.id,
      schoolYear: '2025-2026',
      niveau: '2nde',
      schoolId: 'sd_sch_0751000a',
      source: 'salesforce',
    },
    update: {
      niveau: '2nde',
      schoolId: 'sd_sch_0751000a',
    },
  });

  await prisma.schooling_YearRecord.upsert({
    where: {
      talentId_schoolYear: { talentId: talent.id, schoolYear: '2026-2027' },
    },
    create: {
      talentId: talent.id,
      schoolYear: '2026-2027',
      niveau: '1ere',
      schoolId: 'sd_sch_0751000a',
      source: 'salesforce',
    },
    update: {
      niveau: '1ere',
      schoolId: 'sd_sch_0751000a',
    },
  });

  // 7. Enrol talent into an upcoming Paris event in 2026-2027
  const nextEvent = await prisma.event.findFirst({
    where: { campusId: 'sd_cmp_paris' },
    orderBy: { date: 'desc' },
  });
  if (nextEvent) {
    await prisma.participation.upsert({
      where: {
        talentId_eventId: { talentId: talent.id, eventId: nextEvent.id },
      },
      create: {
        talentId: talent.id,
        eventId: nextEvent.id,
        campusId: 'sd_cmp_paris',
        sfMemberStatus: 'READY',
      },
      update: {
        sfMemberStatus: 'READY',
      },
    });
  }

  // 8. Generate FastLogin token
  const secret = process.env.BETTER_AUTH_SECRET;
  let fastLoginUrl = '';
  if (secret) {
    const token = await mintToken(email, talent.id, secret);
    fastLoginUrl = `http://localhost:5173/fastlogin?token=${token}`;
  }

  console.log('\n======================================================');
  console.log('✓ Talent seedé avec succès !');
  console.log(`- Nom : Léo Dupont`);
  console.log(`- Email : ${email}`);
  console.log(`- ID Talent : ${talent.id}`);
  console.log(`- Année du dernier dossier : 2025-2026 (Complet & signé)`);
  console.log(
    `- Année courante de la plateforme : 2026-2027 (Aucun dossier en cours)`,
  );
  console.log(`- Comportement attendu à la connexion :`);
  console.log(
    `    1. La charte RGPD et le welcome splash sont déjà validés (pas redemandés).`,
  );
  console.log(
    `    2. Le guard détecte qu'aucun dossier 2026-2027 n'existe -> redirection /onboarding.`,
  );
  console.log(
    `    3. Le tunnel d'onboarding s'ouvre pré-rempli avec ses informations de profil.`,
  );
  console.log(
    `    4. Dans /settings/documents, l'ancien dossier 2025-2026 reste visible.`,
  );
  if (fastLoginUrl) {
    console.log(`\n🔗 Lien de connexion directe (sans code OTP) :`);
    console.log(fastLoginUrl);
  }
  console.log('======================================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
