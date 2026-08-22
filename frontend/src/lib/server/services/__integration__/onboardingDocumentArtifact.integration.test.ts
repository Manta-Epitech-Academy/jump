import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';

/**
 * One rendered règlement per dossier, not per talent.
 *
 * The document is signed once per school year, so a returning talent ends up
 * with two of them. They used to share a single storage key
 * (`documents/{talentId}/rules.pdf`), which meant the second year's render
 * overwrote a document a legal guardian had already co-signed for a minor - and
 * nothing could rebuild it, because the worker read the flat projection on
 * `Talent` and only a dossier row says which year a signature belongs to.
 *
 * Puppeteer and S3 are the two things stubbed; everything else is the real
 * pipeline against the real database, because what is under test is precisely
 * which key gets written and which row it lands on.
 */
const saved = new Map<string, number>();

vi.mock('../onboardingDocumentGenerator', () => ({
  generateOnboardingPDF: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

vi.mock('$lib/server/infra/storage', () => ({
  getStorage: () => ({
    save: async (key: string, data: Uint8Array) => {
      // Count writes per key: an overwrite is invisible in a plain key set, and
      // an overwrite of the previous year's object is the whole defect.
      saved.set(key, (saved.get(key) ?? 0) + 1);
      return key;
    },
    get: async () => Buffer.from([]),
    delete: async () => {},
    getDownloadUrl: async (key: string) => `https://example.invalid/${key}`,
  }),
  isObjectNotFound: () => false,
}));

const { signOnboardingRules } = await import('../onboardingService');
const { recordParentRulesSignature } = await import('../parentRulesService');
const { runOnboardingPdfJob } = await import('../onboardingPdfJobService');
const { listTalentDocuments } = await import('../onboardingDocuments');

describe('règlement artifact per dossier (integration)', () => {
  const stamp = Date.now();
  const currentYear = currentSchoolYearLabel();
  const lastYearStart = Number(currentYear.slice(0, 4)) - 1;
  const lastYear = `${lastYearStart}-${lastYearStart + 1}`;
  const signedLastYear = new Date(Date.UTC(lastYearStart + 1, 2, 3));
  /** The pre-annual key, as the migration backfill leaves it on the dossier. */
  const legacyKey = 'documents/legacy/rules.pdf';

  let campusId = '';
  let eventId = '';
  let talentId = '';

  /** Runs every job the pipeline queued, oldest first, then clears the queue. */
  async function drainJobs(): Promise<void> {
    const jobs = await prisma.onboardingPdfJob.findMany({
      where: { talentId, status: { not: 'success' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    for (const job of jobs) await runOnboardingPdfJob(job.id);
  }

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: {
        name: `Test Campus DA ${stamp}`,
        externalName: `TEST_CAMPUS_DA_${stamp}`,
      },
    });
    campusId = campus.id;
    const event = await prisma.event.create({
      data: { titre: `Test Event DA ${stamp}`, date: new Date(), campusId },
    });
    eventId = event.id;

    // A talent who finished last year, guardian included, and whose render sits
    // at the pre-annual key. This is exactly the state the migration produces.
    const talent = await prisma.talent.create({
      data: {
        nom: 'Artifact',
        prenom: 'Test',
        niveau: '1ere',
        charterAcceptedAt: signedLastYear,
        onboardingSchoolYear: lastYear,
        rulesSignedAt: signedLastYear,
        rulesSignedCity: 'Lille',
        reglementVersion: '2025-2026',
        parentRulesSignedAt: signedLastYear,
        parentRulesSignerPrenom: 'Marie',
        parentRulesSignerNom: 'Dupont',
        parentRulesRelationship: 'mère',
        parentRulesSignedCity: 'Lille',
        onboardingRecords: {
          create: {
            schoolYear: lastYear,
            rulesSignedAt: signedLastYear,
            rulesSignedCity: 'Lille',
            reglementVersion: '2025-2026',
            rulesFilePath: legacyKey,
            parentRulesSignedAt: signedLastYear,
            parentRulesSignerPrenom: 'Marie',
            parentRulesSignerNom: 'Dupont',
            parentRulesRelationship: 'mère',
            parentRulesSignedCity: 'Lille',
          },
        },
      },
    });
    talentId = talent.id;
    await prisma.participation.create({
      data: { talentId, eventId, campusId },
    });
  });

  afterAll(async () => {
    await prisma.participation.deleteMany({ where: { talentId } });
    await prisma.xpGrant.deleteMany({ where: { talentId } });
    await prisma.onboardingPdfJob.deleteMany({ where: { talentId } });
    await prisma.onboarding_Record.deleteMany({ where: { talentId } });
    await prisma.talent.deleteMany({ where: { id: talentId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it("keeps last year's co-signed PDF when the talent signs again", async () => {
    await signOnboardingRules({
      talentId,
      studentName: 'Test Artifact',
      city: 'Paris',
    });
    await drainJobs();

    const currentKey = `documents/${talentId}/rules-${currentYear}.pdf`;
    // The new render went to its own key, and last year's object was never
    // written to. Before the artifact moved, both of these were the same key and
    // this write destroyed a document a guardian had co-signed.
    expect(saved.get(currentKey)).toBe(1);
    expect(saved.has(legacyKey)).toBe(false);
    expect(saved.has(`documents/${talentId}/rules.pdf`)).toBe(false);

    const dossiers = await prisma.onboarding_Record.findMany({
      where: { talentId },
      orderBy: { schoolYear: 'asc' },
      select: { schoolYear: true, rulesFilePath: true, reglementVersion: true },
    });
    expect(dossiers).toHaveLength(2);
    // Last year's row is untouched: its own key, and its own wording.
    expect(dossiers[0]).toMatchObject({
      schoolYear: lastYear,
      rulesFilePath: legacyKey,
      reglementVersion: '2025-2026',
    });
    expect(dossiers[1]).toMatchObject({
      schoolYear: currentYear,
      rulesFilePath: currentKey,
    });
  });

  it('renders the co-signature onto the year it was given for', async () => {
    await recordParentRulesSignature({
      talentId,
      studentName: 'Test Artifact',
      signerPrenom: 'Marie',
      signerNom: 'Dupont',
      relationship: 'mère',
      city: 'Paris',
      reglementVersion: '2026-2027',
    });
    await drainJobs();

    const currentKey = `documents/${talentId}/rules-${currentYear}.pdf`;
    // The co-signature rewrites THIS year's object (both blocks now) and still
    // leaves the previous year's alone.
    expect(saved.get(currentKey)).toBe(2);
    expect(saved.has(legacyKey)).toBe(false);

    const previous = await prisma.onboarding_Record.findUniqueOrThrow({
      where: { talentId_schoolYear: { talentId, schoolYear: lastYear } },
      select: { rulesFilePath: true, parentRulesSignedCity: true },
    });
    expect(previous.rulesFilePath).toBe(legacyKey);
    // The guardian signed for the current year, so last year's signature block
    // keeps the town it was actually given in.
    expect(previous.parentRulesSignedCity).toBe('Lille');
  });

  it('offers the talent both years, newest first', async () => {
    const documents = await listTalentDocuments(talentId);
    const rules = documents.filter((d) => d.type === 'rules');
    expect(rules.map((d) => d.schoolYear)).toEqual([currentYear, lastYear]);
    // Both downloadable: the older one is not shadowed by the newer.
    expect(rules.every((d) => d.ready)).toBe(true);
  });
});
