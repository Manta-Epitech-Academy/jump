import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';
import { parentBlockedWhere } from '$lib/server/db/dossierCompliance';
import { isParentDossierComplete } from '$lib/domain/dossierCompliance';
import { imageRightsStance, imageRightsStatus } from '$lib/domain/imageRights';

/**
 * The droit à l'image, decided once per school year.
 *
 * Everything here is about the one path the change creates: the talent who
 * comes back. Their guardian answered last year, and the platform now has to
 * ask again without destroying what was signed, without forgetting a refusal,
 * and without re-rendering an old document in this year's wording.
 *
 * Puppeteer and S3 are the two things stubbed; everything else is the real
 * pipeline against the real database, because what is under test is which key
 * gets written, which row it lands on, and which wording the render is pinned to.
 */
const saved = new Map<string, number>();
const generated: Array<Record<string, unknown>> = [];

vi.mock('../onboardingDocumentGenerator', () => ({
  generateOnboardingPDF: vi.fn(async (data: Record<string, unknown>) => {
    generated.push(data);
    return new Uint8Array([1, 2, 3]);
  }),
}));

vi.mock('$lib/server/infra/storage', () => ({
  getStorage: () => ({
    save: async (key: string) => {
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
const { recordImageRightsDecision } = await import('../imageRightsService');
const { runOnboardingPdfJob } = await import('../onboardingPdfJobService');
const { listTalentDocuments } = await import('../onboardingDocuments');
const { getComplianceStatus } = await import('../adminStats/complianceStatus');

describe("droit à l'image, décision annuelle (integration)", () => {
  const stamp = Date.now();
  const currentYear = currentSchoolYearLabel();
  const lastYearStart = Number(currentYear.slice(0, 4)) - 1;
  const lastYear = `${lastYearStart}-${lastYearStart + 1}`;
  const decidedLastYear = new Date(Date.UTC(lastYearStart + 1, 2, 3));
  /** The pre-annual key, as the migration backfill leaves it on the dossier. */
  const legacyKey = 'documents/legacy/image-rights.pdf';

  let campusId = '';
  let talentId = '';

  async function drainJobs(): Promise<void> {
    const jobs = await prisma.onboardingPdfJob.findMany({
      where: { talentId, status: { not: 'success' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    for (const job of jobs) await runOnboardingPdfJob(job.id);
  }

  /** The talent row as every "what is owed" reader sees it. */
  async function projection() {
    return prisma.talent.findUniqueOrThrow({
      where: { id: talentId },
      select: {
        imageRightsDecision: true,
        imageRightsDecidedAt: true,
        parentRulesSignedAt: true,
        onboardingSchoolYear: true,
      },
    });
  }

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: {
        name: `Test Campus IR ${stamp}`,
        externalName: `TEST_CAMPUS_IR_${stamp}`,
      },
    });
    campusId = campus.id;

    // A talent whose guardian REFUSED last year, with the decision on last
    // year's dossier, mirrored on the projection, backed by a ledger fact, and
    // the render sitting at the pre-annual key. Exactly the state the migration
    // produces for a refused talent.
    const talent = await prisma.talent.create({
      data: {
        nom: 'Annuel',
        prenom: 'Test',
        niveau: '1ere',
        parentEmail: `parent.ir.${stamp}@example.invalid`,
        parentPrenom: 'Marie',
        parentNom: 'Dupont',
        charterAcceptedAt: decidedLastYear,
        onboardingSchoolYear: lastYear,
        rulesSignedAt: decidedLastYear,
        rulesSignedCity: 'Lille',
        reglementVersion: '2025-2026',
        parentRulesSignedAt: decidedLastYear,
        parentRulesSignerPrenom: 'Marie',
        parentRulesSignerNom: 'Dupont',
        parentRulesRelationship: 'mère',
        parentRulesSignedCity: 'Lille',
        imageRightsDecision: 'refused',
        imageRightsDecidedAt: decidedLastYear,
        imageRightsSignerPrenom: 'Marie',
        imageRightsSignerNom: 'Dupont',
        onboardingRecords: {
          create: {
            schoolYear: lastYear,
            rulesSignedAt: decidedLastYear,
            rulesSignedCity: 'Lille',
            reglementVersion: '2025-2026',
            rulesFilePath: 'documents/legacy/rules.pdf',
            parentRulesSignedAt: decidedLastYear,
            parentRulesSignerPrenom: 'Marie',
            parentRulesSignerNom: 'Dupont',
            parentRulesRelationship: 'mère',
            parentRulesSignedCity: 'Lille',
            imageRightsDecision: 'refused',
            imageRightsDecidedAt: decidedLastYear,
            imageRightsSignerPrenom: 'Marie',
            imageRightsSignerNom: 'Dupont',
            imageRightsRelationship: 'mère',
            imageRightsSignedCity: 'Lille',
            imageRightsVersion: '2025-2026',
            imageRightsFilePath: legacyKey,
          },
        },
        imageRightsRecords: {
          create: {
            schoolYear: lastYear,
            version: '2025-2026',
            decision: 'refused',
            decidedAt: decidedLastYear,
            signerPrenom: 'Marie',
            signerNom: 'Dupont',
            relationship: 'mère',
            city: 'Lille',
            source: 'parent_portal',
          },
        },
      },
    });
    talentId = talent.id;
  });

  afterAll(async () => {
    await prisma.onboardingPdfJob.deleteMany({ where: { talentId } });
    await prisma.imageRightsDecisionRecord.deleteMany({ where: { talentId } });
    await prisma.xpGrant.deleteMany({ where: { talentId } });
    await prisma.onboarding_Record.deleteMany({ where: { talentId } });
    await prisma.talent.deleteMany({ where: { id: talentId } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it('asks the guardian again once their child reopens a dossier', async () => {
    // Before: last year's dossier is settled, so nothing is owed.
    expect(isParentDossierComplete(await projection())).toBe(true);

    // The talent walks the règlement again, which opens this year's dossier and
    // moves the projection onto it.
    await signOnboardingRules({
      talentId,
      city: 'Paris',
    });
    await drainJobs();

    const after = await projection();
    expect(after.onboardingSchoolYear).toBe(currentYear);
    // Both guardian acts are owed again, from the one projection: the decision
    // is annual now, so it goes blank with the co-signature beside it.
    expect(after.imageRightsDecidedAt).toBeNull();
    expect(isParentDossierComplete(after)).toBe(false);

    // And the SQL twin agrees, which is what actually decides whether this
    // family is chased (the parent guard and the relance audience both use it).
    const blocked = await prisma.talent.count({
      where: { AND: [{ id: talentId }, parentBlockedWhere] },
    });
    expect(blocked).toBe(1);
  });

  it('keeps forbidding on the lapsed refusal, while the dossier is undecided', async () => {
    // THE case this whole shape exists for. The dossier reads "en attente"
    // because the guardian is being asked again; the printed badge must still
    // carry the marker, because nobody has withdrawn the refusal.
    const talent = await projection();
    expect(imageRightsStatus(talent)).toBe('undecided');

    const latest = await prisma.imageRightsDecisionRecord.findFirstOrThrow({
      where: { talentId },
      orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }],
      select: { decision: true, schoolYear: true },
    });
    expect(latest).toMatchObject({ decision: 'refused', schoolYear: lastYear });
    expect(imageRightsStance(imageRightsStatus(talent), latest.decision)).toBe(
      'forbidden',
    );
  });

  it("gives this year's decision its own document, leaving last year's intact", async () => {
    saved.clear();
    await recordImageRightsDecision({
      talentId,
      decision: 'accepted',
      signerPrenom: 'Marie',
      signerNom: 'Dupont',
      relationship: 'mère',
      city: 'Paris',
    });
    await drainJobs();

    const currentKey = `documents/${talentId}/image-rights-${currentYear}.pdf`;
    // At least once: generation is fire-and-forget, so the service's own
    // `void runOnboardingPdfJob` and the drain above can both claim the job and
    // render it twice. That is harmless by design (same key, same bytes) and an
    // exact count here would only be flaky.
    expect(saved.get(currentKey)).toBeGreaterThanOrEqual(1);
    // What is exact, and what the whole change is about: last year's object was
    // never written to. Before the artifact moved onto the dossier, both of
    // these were `image-rights.pdf` and this write destroyed the document
    // attesting a refusal.
    expect(saved.has(legacyKey)).toBe(false);
    expect(saved.has(`documents/${talentId}/image-rights.pdf`)).toBe(false);

    const dossiers = await prisma.onboarding_Record.findMany({
      where: { talentId },
      orderBy: { schoolYear: 'asc' },
      select: {
        schoolYear: true,
        imageRightsDecision: true,
        imageRightsFilePath: true,
        imageRightsVersion: true,
      },
    });
    expect(dossiers).toHaveLength(2);
    expect(dossiers[0]).toMatchObject({
      schoolYear: lastYear,
      imageRightsDecision: 'refused',
      imageRightsFilePath: legacyKey,
      imageRightsVersion: '2025-2026',
    });
    expect(dossiers[1]).toMatchObject({
      schoolYear: currentYear,
      imageRightsDecision: 'accepted',
      imageRightsFilePath: currentKey,
    });
  });

  it('files the new decision as its own fact, dated and versioned', async () => {
    const records = await prisma.imageRightsDecisionRecord.findMany({
      where: { talentId },
      orderBy: { decidedAt: 'asc' },
      select: { schoolYear: true, version: true, decision: true },
    });
    // Append-only: last year's refusal is still there, under its own year and
    // its own wording. That is what makes a superseded decision reproducible.
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      schoolYear: lastYear,
      version: '2025-2026',
      decision: 'refused',
    });
    expect(records[1]).toMatchObject({
      schoolYear: currentYear,
      version: '2026-2027',
      decision: 'accepted',
    });
  });

  it("pins a re-render to the wording that year's decision committed to", async () => {
    generated.length = 0;
    // A retry of last year's document, exactly as the admin PDF page fires one:
    // it must render the text signed then, not the wording in force now.
    const job = await prisma.onboardingPdfJob.create({
      data: { talentId, documentType: 'image-rights', schoolYear: lastYear },
    });
    await runOnboardingPdfJob(job.id);

    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({
      type: 'image-rights',
      // Off the dossier, and off nothing else: the job carries only which
      // document and which year, so the decision, its wording, the signer and
      // the place of signature all come from the row the render belongs to.
      droitImageVersion: '2025-2026',
      decision: 'refused',
      schoolYear: lastYear,
      city: 'Lille',
    });
    // And it wrote back onto last year's key, not this year's.
    expect(
      saved.has(`documents/${talentId}/image-rights-${lastYear}.pdf`),
    ).toBe(true);
  });

  it('offers the talent both years of documents, newest first', async () => {
    const documents = await listTalentDocuments(talentId);
    const image = documents.filter((d) => d.type === 'image-rights');
    expect(image.map((d) => d.schoolYear)).toEqual([currentYear, lastYear]);
    // Both downloadable: the older one is not shadowed by the newer.
    expect(image.every((d) => d.ready)).toBe(true);
  });

  it('counts a scoped cohort on the decision of the year in scope', async () => {
    // Two events, one per school year, so a scoped cohort resolves. The talent
    // refused for last year and authorized for this one, which is the only shape
    // that tells the two readings apart: counting the projection would report
    // this year's authorization as last year's answer.
    const lastYearEvent = await prisma.event.create({
      data: {
        titre: `Test Event IR ${stamp} A`,
        date: decidedLastYear,
        campusId,
      },
    });
    const thisYearEvent = await prisma.event.create({
      data: { titre: `Test Event IR ${stamp} B`, date: new Date(), campusId },
    });
    await prisma.participation.createMany({
      data: [
        { talentId, eventId: lastYearEvent.id, campusId },
        { talentId, eventId: thisYearEvent.id, campusId },
      ],
    });

    const rowsFor = async (schoolYear: string) => {
      const status = await getComplianceStatus({ schoolYear });
      return Object.fromEntries(
        status.imageRights.value.map((r) => [r.status, r.count]),
      );
    };

    const last = await rowsFor(lastYear);
    expect(last.refused).toBe(1);
    expect(last.accepted).toBe(0);

    const current = await rowsFor(currentYear);
    expect(current.accepted).toBe(1);
    expect(current.refused).toBe(0);

    await prisma.participation.deleteMany({ where: { talentId } });
    await prisma.event.deleteMany({
      where: { id: { in: [lastYearEvent.id, thisYearEvent.id] } },
    });
  });

  describe('a standing refusal, in the figures', () => {
    let refusedTalentId = '';
    let eventId = '';
    const campus = () => ({ id: campusId, name: `Test Campus IR ${stamp}` });

    beforeAll(async () => {
      // Refused last year, came back this year, not asked yet: the dossier in
      // hand is undecided while the interdiction still stands. This is the state
      // a returning September cohort is in, and the one that used to be invisible
      // to every figure.
      const talent = await prisma.talent.create({
        data: {
          nom: 'Standing',
          prenom: 'Test',
          niveau: '1ere',
          onboardingSchoolYear: currentYear,
          rulesSignedAt: new Date(),
          onboardingRecords: {
            create: [
              {
                schoolYear: lastYear,
                imageRightsDecision: 'refused',
                imageRightsDecidedAt: decidedLastYear,
              },
              { schoolYear: currentYear, rulesSignedAt: new Date() },
            ],
          },
          imageRightsRecords: {
            create: {
              schoolYear: lastYear,
              version: '2025-2026',
              decision: 'refused',
              decidedAt: decidedLastYear,
              source: 'parent_portal',
            },
          },
        },
      });
      refusedTalentId = talent.id;
      const event = await prisma.event.create({
        data: { titre: `Test Event IR ${stamp} C`, date: new Date(), campusId },
      });
      eventId = event.id;
      await prisma.participation.create({
        data: { talentId: refusedTalentId, eventId, campusId },
      });
    });

    afterAll(async () => {
      await prisma.participation.deleteMany({
        where: { talentId: refusedTalentId },
      });
      await prisma.event.deleteMany({ where: { id: eventId } });
      await prisma.imageRightsDecisionRecord.deleteMany({
        where: { talentId: refusedTalentId },
      });
      await prisma.onboarding_Record.deleteMany({
        where: { talentId: refusedTalentId },
      });
      await prisma.talent.deleteMany({ where: { id: refusedTalentId } });
    });

    it('reports the interdiction while this year reads "en attente"', async () => {
      const status = await getComplianceStatus({ campus: campus() });
      const rows = Object.fromEntries(
        status.imageRights.value.map((r) => [r.status, r.count]),
      );
      // The three-state breakdown is the state of THIS year's campaign, and it
      // is right: nobody has answered for the dossier in hand, so this family is
      // still to chase.
      expect(rows.refused).toBe(0);
      expect(rows.undecided).toBe(1);
      // And the figure a human consults before publishing a photo says the
      // opposite about the same student, which is the point of it existing. Read
      // off the breakdown alone, the answer to "combien ne doivent pas être
      // photographiés" was zero, with a definition that made it sound complete.
      expect(status.imageUseForbidden.value).toBe(1);
      expect(status.imageUseForbiddenShare.value).toBe(100);
    });

    it('does not let the school-year filter narrow an interdiction', async () => {
      // Every other figure here moves with the year filter. This one must not: an
      // authorization expires, an interdiction does not, so scoping to the year
      // in progress would report "personne n'est interdit cette année".
      const scoped = await getComplianceStatus({
        campus: campus(),
        schoolYear: currentYear,
      });
      expect(scoped.imageUseForbidden.value).toBe(1);
      const rows = Object.fromEntries(
        scoped.imageRights.value.map((r) => [r.status, r.count]),
      );
      expect(rows.refused).toBe(0);
    });
  });

  describe('a guardian answering after the 31 July cutover', () => {
    let lateTalentId = '';

    beforeAll(async () => {
      // A talent whose only dossier is last year's and who has NOT come back.
      // Their guardian is answering the question that dossier asked.
      const talent = await prisma.talent.create({
        data: {
          nom: 'Cutover',
          prenom: 'Test',
          niveau: '1ere',
          parentEmail: `parent.co.${stamp}@example.invalid`,
          onboardingSchoolYear: lastYear,
          rulesSignedAt: decidedLastYear,
          onboardingRecords: {
            create: { schoolYear: lastYear, rulesSignedAt: decidedLastYear },
          },
        },
      });
      lateTalentId = talent.id;
    });

    afterAll(async () => {
      await prisma.onboardingPdfJob.deleteMany({
        where: { talentId: lateTalentId },
      });
      await prisma.imageRightsDecisionRecord.deleteMany({
        where: { talentId: lateTalentId },
      });
      await prisma.onboarding_Record.deleteMany({
        where: { talentId: lateTalentId },
      });
      await prisma.talent.deleteMany({ where: { id: lateTalentId } });
    });

    it("files the decision on the dossier that asked, not on the clock's year", async () => {
      // The rule the whole model turns on, and the one a reasonable-looking
      // change breaks silently: resolving the year from the clock would file
      // this against a year nobody opened, leave last year's dossier undecided,
      // and the parent portal would ask for it again the moment it was given.
      await recordImageRightsDecision({
        talentId: lateTalentId,
        decision: 'accepted',
        signerPrenom: 'Paul',
        signerNom: 'Durand',
        relationship: 'père',
        city: 'Nantes',
      });

      const dossiers = await prisma.onboarding_Record.findMany({
        where: { talentId: lateTalentId },
        select: { schoolYear: true, imageRightsDecision: true },
      });
      expect(dossiers).toHaveLength(1);
      expect(dossiers[0]).toMatchObject({
        schoolYear: lastYear,
        imageRightsDecision: 'accepted',
      });

      const record = await prisma.imageRightsDecisionRecord.findFirstOrThrow({
        where: { talentId: lateTalentId },
        select: { schoolYear: true },
      });
      expect(record.schoolYear).toBe(lastYear);

      // And the projection followed, so the guardian is not asked again.
      const talent = await prisma.talent.findUniqueOrThrow({
        where: { id: lateTalentId },
        select: {
          imageRightsDecidedAt: true,
          onboardingSchoolYear: true,
        },
      });
      expect(talent.onboardingSchoolYear).toBe(lastYear);
      expect(talent.imageRightsDecidedAt).not.toBeNull();
    });
  });
});
