import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';

/**
 * One render per job, even when two callers fire it at once.
 *
 * Every caller runs this fire-and-forget (`void runOnboardingPdfJob(id)`): the
 * parent co-signature, the onboarding route, and the admin page's "Relancer" and
 * "Relancer tout". So two callers reaching the same row is ordinary, not
 * hypothetical, and the claim is what has to decide between them.
 *
 * It could not. The predicate was `status: { not: 'success' }`, which also
 * matches a row that is already `processing`, so both callers updated it, both
 * read count 1, and both rendered - the `count === 0` guard was unreachable.
 * Found by the integration suite finally running in CI: the same job rendering
 * twice pushed a save counter in `onboardingDocumentArtifact` from 2 to 3 on a
 * slower runner, and passed on a laptop where the background render always won
 * the race.
 *
 * The rule now comes from `claimableJobWhere()`, the Prisma dialect of
 * `isOnboardingPdfJobRetryable`, so what the claim accepts and what the admin
 * page offers cannot drift. Both halves are asserted here: an in-flight row is
 * refused, and a crash-stranded one is still recoverable, because a claim that
 * only ever refuses would strand every job a dying pod left behind.
 *
 * The in-flight state is STAGED rather than raced for. Firing two runs at once
 * and hoping to catch the overlap passes against the old predicate about as
 * often as it fails, since the first call frequently finishes before the
 * second's claim lands - a test that has to win a race in order to fail is the
 * flaky kind this suite refuses. Staging `processing` asserts the same rule and
 * fails every time the rule is wrong (checked by reverting the predicate).
 */
const saved = new Map<string, number>();

vi.mock('../onboardingDocumentGenerator', () => ({
  generateOnboardingPDF: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

vi.mock('$lib/server/infra/storage', () => ({
  getStorage: () => ({
    save: async (key: string) => {
      saved.set(key, (saved.get(key) ?? 0) + 1);
      return key;
    },
    get: async () => Buffer.from([]),
    delete: async () => {},
    getDownloadUrl: async (key: string) => `https://example.invalid/${key}`,
  }),
  isObjectNotFound: () => false,
}));

const { runOnboardingPdfJob } = await import('../onboardingPdfJobService');

/** Past the 5 min stranded window, so a `processing` row reads as dead. */
const STRANDED_AGO_MS = 6 * 60_000;

describe('onboarding PDF job claim (integration)', () => {
  const stamp = Date.now();
  const schoolYear = currentSchoolYearLabel();
  let talentId = '';
  let key = '';

  /**
   * `updatedAt` carries `@updatedAt`, so Prisma stamps it on every write and a
   * plain `update` cannot backdate it. Raw SQL is the only way to stage "this row
   * has been processing for six minutes".
   */
  async function stageProcessing(jobId: string, ageMs: number): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "OnboardingPdfJob"
      SET status = 'processing',
          "updatedAt" = NOW() - (${ageMs} || ' milliseconds')::interval
      WHERE id = ${jobId}`;
  }

  async function newJob(): Promise<string> {
    const job = await prisma.onboardingPdfJob.create({
      data: { talentId, documentType: 'rules', schoolYear },
    });
    return job.id;
  }

  beforeAll(async () => {
    assertTestDatabase();
    const talent = await prisma.talent.create({
      data: {
        nom: 'Claim',
        prenom: 'Test',
        niveau: '1ere',
        onboardingSchoolYear: schoolYear,
        onboardingRecords: {
          create: {
            schoolYear,
            rulesSignedAt: new Date(),
            rulesSignedCity: 'Lille',
            reglementVersion: '2026-2027',
          },
        },
      },
    });
    talentId = talent.id;
    key = `documents/${talentId}/rules-${schoolYear}.pdf`;
  });

  beforeEach(async () => {
    saved.clear();
    await prisma.onboardingPdfJob.deleteMany({ where: { talentId } });
  });

  afterAll(async () => {
    await prisma.onboardingPdfJob.deleteMany({ where: { talentId } });
    await prisma.onboarding_Record.deleteMany({ where: { talentId } });
    await prisma.talent.deleteMany({ where: { id: talentId } });
  });

  it('renders a pending job once, and records the key it wrote', async () => {
    const jobId = await newJob();

    await runOnboardingPdfJob(jobId);

    expect(saved.get(key)).toBe(1);
    const job = await prisma.onboardingPdfJob.findUniqueOrThrow({
      where: { id: jobId },
      select: { status: true, filePath: true },
    });
    expect(job).toMatchObject({ status: 'success', filePath: key });
  });

  it('refuses a job that is legitimately in flight', async () => {
    const jobId = await newJob();
    await stageProcessing(jobId, 0);

    await runOnboardingPdfJob(jobId);

    // What the refused render would have cost is a browser-pool slot, at the
    // moment the pool is the bottleneck.
    expect(saved.has(key)).toBe(false);
    const job = await prisma.onboardingPdfJob.findUniqueOrThrow({
      where: { id: jobId },
      select: { status: true },
    });
    // Left alone for its owner to finish, not marked failed.
    expect(job.status).toBe('processing');
  });

  it('still recovers a job left stranded by a dead pod', async () => {
    const jobId = await newJob();
    await stageProcessing(jobId, STRANDED_AGO_MS);

    await runOnboardingPdfJob(jobId);

    expect(saved.get(key)).toBe(1);
    const job = await prisma.onboardingPdfJob.findUniqueOrThrow({
      where: { id: jobId },
      select: { status: true },
    });
    expect(job.status).toBe('success');
  });

  it('does nothing to a job that already succeeded', async () => {
    const jobId = await newJob();
    await runOnboardingPdfJob(jobId);
    expect(saved.get(key)).toBe(1);

    await runOnboardingPdfJob(jobId);

    expect(saved.get(key)).toBe(1);
  });
});
