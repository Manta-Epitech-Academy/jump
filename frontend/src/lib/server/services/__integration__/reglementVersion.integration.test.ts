import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import {
  CURRENT_REGLEMENT_VERSION,
  LEGACY_REGLEMENT_VERSION,
} from '$lib/content/reglement';

// The two services under test enqueue a PDF job inside their transaction, which
// is part of what we assert. `recordParentRulesSignature` additionally fires the
// generation itself (Puppeteer + S3), unawaited; only that call is stubbed, so
// the transaction and the enqueue stay real.
vi.mock('../onboardingPdfJobService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../onboardingPdfJobService')>()),
  runOnboardingPdfJob: vi.fn(async () => {}),
}));

const { signOnboardingRules } = await import('../onboardingService');
const { recordParentRulesSignature } = await import('../parentRulesService');

/**
 * Which règlement a signature is bound to. The PDF is regenerated from DB state
 * on every co-signature, so an unpinned or repinned version means a minor's
 * guardian ends up holding a document whose text nobody in the family read.
 *
 * The guardian is invited at the `parents` step, four rungs before their child
 * reaches `rules`, so both orders of signing are reachable and both are checked.
 */
describe('règlement version pinning (integration)', () => {
  const stamp = Date.now();
  let campusId = '';
  let eventId = '';
  const talentIds: string[] = [];

  async function makeTalent(over: Record<string, unknown> = {}) {
    const talent = await prisma.talent.create({
      data: { nom: 'Test', prenom: 'Reglement', ...over },
    });
    talentIds.push(talent.id);
    await prisma.participation.create({
      data: { talentId: talent.id, eventId, campusId },
    });
    return talent;
  }

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: {
        name: `Test Campus RV ${stamp}`,
        externalName: `TEST_CAMPUS_RV_${stamp}`,
      },
    });
    campusId = campus.id;
    const event = await prisma.event.create({
      data: {
        titre: `Test Event RV ${stamp}`,
        date: new Date(),
        campusId,
      },
    });
    eventId = event.id;
  });

  afterAll(async () => {
    await prisma.participation.deleteMany({
      where: { talentId: { in: talentIds } },
    });
    await prisma.xpGrant.deleteMany({ where: { talentId: { in: talentIds } } });
    await prisma.onboardingPdfJob.deleteMany({
      where: { talentId: { in: talentIds } },
    });
    await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it('pins the current version when the talent signs', async () => {
    const talent = await makeTalent();

    await signOnboardingRules({
      talentId: talent.id,
      studentName: 'Reglement Test',
      city: 'Paris',
    });

    const after = await prisma.talent.findUniqueOrThrow({
      where: { id: talent.id },
      select: { reglementVersion: true, rulesSignedAt: true },
    });
    expect(after.rulesSignedAt).not.toBeNull();
    expect(after.reglementVersion).toBe(CURRENT_REGLEMENT_VERSION);
  });

  it('pins the version the guardian was shown when they sign first', async () => {
    // Reachable: the guardian is invited four rungs before the talent reaches
    // the règlement. Left unpinned, the PDF would later render the
    // pre-versioning text under a signature given on the current one.
    const talent = await makeTalent();

    await recordParentRulesSignature({
      talentId: talent.id,
      studentName: 'Reglement Test',
      signerPrenom: 'Marie',
      signerNom: 'Dupont',
      relationship: 'mère',
      city: 'Lyon',
      reglementVersion: CURRENT_REGLEMENT_VERSION,
    });

    const after = await prisma.talent.findUniqueOrThrow({
      where: { id: talent.id },
      select: { reglementVersion: true, parentRulesSignedAt: true },
    });
    expect(after.parentRulesSignedAt).not.toBeNull();
    expect(after.reglementVersion).toBe(CURRENT_REGLEMENT_VERSION);
  });

  it('never repins a version the talent already committed to', async () => {
    // A talent who signed the older wording keeps it, even though the guardian
    // co-signs after the new text went live. This is the whole point: one
    // document, one text, two signatures.
    const talent = await makeTalent({
      rulesSignedAt: new Date('2026-03-01T10:00:00Z'),
      reglementVersion: LEGACY_REGLEMENT_VERSION,
    });

    await recordParentRulesSignature({
      talentId: talent.id,
      studentName: 'Reglement Test',
      signerPrenom: 'Marie',
      signerNom: 'Dupont',
      relationship: 'mère',
      city: 'Lyon',
      reglementVersion: LEGACY_REGLEMENT_VERSION,
    });

    const after = await prisma.talent.findUniqueOrThrow({
      where: { id: talent.id },
      select: { reglementVersion: true },
    });
    expect(after.reglementVersion).toBe(LEGACY_REGLEMENT_VERSION);
    expect(after.reglementVersion).not.toBe(CURRENT_REGLEMENT_VERSION);
  });
});
