import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import {
  signOnboardingRules,
  validateTalentInterests,
  ensureParentAccount,
} from '../onboardingService';
import { getOnboardingFunnel } from '../adminStats/onboardingFunnel';
import { resolveScope, UnknownScopeError } from '$lib/server/adminApi/scope';
import { WELCOME_XP_BONUS } from '$lib/domain/xp';

/**
 * The rules signature is the transaction that closes onboarding: timestamps, the
 * XP facts, and the PDF job must all land together or not at all. It also feeds
 * the funnel aggregate, so the two are checked against the same rows here - that
 * is what proves the per-rung SQL in `onboardingFunnel` matches the ladder the
 * wizard walks.
 */
describe('onboardingService (integration)', () => {
  const stamp = Date.now();
  let campusId = '';
  let eventId = '';
  const talentIds: string[] = [];
  const userIds: string[] = [];
  let techInterestId = '';
  let generalInterestId = '';

  /** A talent with a participation, so they have a campus (early-bird needs one). */
  async function makeTalent(
    over: Partial<{
      infoValidatedAt: Date | null;
      highSchoolValidatedAt: Date | null;
      parentsValidatedAt: Date | null;
      techInterestsValidatedAt: Date | null;
      generalInterestsValidatedAt: Date | null;
      equipmentValidatedAt: Date | null;
      processingCompletedAt: Date | null;
      rulesSignedAt: Date | null;
      charterAcceptedAt: Date | null;
    }> = {},
  ) {
    const talent = await prisma.talent.create({
      data: { nom: 'Test', prenom: 'Talent', ...over },
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
        name: `Test Campus ${stamp}`,
        externalName: `TEST_CAMPUS_${stamp}`,
      },
    });
    campusId = campus.id;
    const event = await prisma.event.create({
      data: {
        titre: `Test Onboarding Event ${stamp}`,
        campusId,
        date: new Date('2026-02-12T09:00:00.000Z'),
      },
    });
    eventId = event.id;

    const [tech, general] = await Promise.all([
      prisma.interest.create({
        data: { nom: `Test tech ${stamp}`, kind: 'tech', order: 999 },
      }),
      prisma.interest.create({
        data: { nom: `Test general ${stamp}`, kind: 'general', order: 999 },
      }),
    ]);
    techInterestId = tech.id;
    generalInterestId = general.id;
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
      await prisma.interest.deleteMany({
        where: { id: { in: [techInterestId, generalInterestId] } },
      });
      if (eventId) {
        await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
      }
      if (userIds.length) {
        await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
      }
      if (campusId) {
        await prisma.campus.delete({ where: { id: campusId } }).catch(() => {});
      }
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('stamps the signature, grants the arrival XP and enqueues the PDF job in one go', async () => {
    const talent = await makeTalent({
      infoValidatedAt: new Date(),
      highSchoolValidatedAt: new Date(),
      parentsValidatedAt: new Date(),
      techInterestsValidatedAt: new Date(),
      generalInterestsValidatedAt: new Date(),
      equipmentValidatedAt: new Date(),
      processingCompletedAt: new Date(),
    });

    const { jobId } = await signOnboardingRules({
      talentId: talent.id,
      studentName: 'Test Talent',
      city: 'Lille',
    });

    const [after, grants, job] = await Promise.all([
      prisma.talent.findUnique({ where: { id: talent.id } }),
      prisma.xpGrant.findMany({ where: { talentId: talent.id } }),
      prisma.onboardingPdfJob.findUnique({ where: { id: jobId } }),
    ]);

    expect(after?.rulesSignedAt).not.toBeNull();
    expect(after?.charterAcceptedAt).not.toBeNull();
    expect(after?.rulesSignedCity).toBe('Lille');
    // Base welcome grant, plus the early-bird layer for an empty campus. Both are
    // separate facts on purpose, so the reward stays explainable.
    expect(grants.some((g) => g.source === 'onboarding')).toBe(true);
    expect(grants.find((g) => g.source === 'onboarding')?.amount).toBe(
      WELCOME_XP_BONUS,
    );
    // `Talent.xp` is a cached projection of the ledger, refreshed in the same
    // transaction - never mutated on its own.
    const total = grants.reduce((sum, g) => sum + g.amount, 0);
    expect(after?.xp).toBe(total);
    expect(job?.documentType).toBe('rules');
  });

  it('swaps the whole interest selection and stamps both interest steps', async () => {
    const talent = await makeTalent();

    const first = await validateTalentInterests(talent.id, {
      techInterestIds: [techInterestId],
      generalInterestIds: [generalInterestId],
      freeText: 'La robotique',
    });
    expect(first.ok).toBe(true);

    const after = await prisma.talent.findUnique({
      where: { id: talent.id },
      select: {
        techInterestsValidatedAt: true,
        generalInterestsValidatedAt: true,
        interestsRecapSeenAt: true,
        interestsFreeText: true,
        interests: { select: { interestId: true } },
      },
    });
    expect(after?.techInterestsValidatedAt).not.toBeNull();
    expect(after?.generalInterestsValidatedAt).not.toBeNull();
    expect(after?.interestsRecapSeenAt).not.toBeNull();
    expect(after?.interestsFreeText).toBe('La robotique');
    expect(after?.interests).toHaveLength(2);

    // Re-submitting a narrower selection replaces it rather than adding to it.
    const second = await validateTalentInterests(talent.id, {
      techInterestIds: [techInterestId],
      generalInterestIds: [],
    });
    expect(second.ok).toBe(true);
    expect(
      await prisma.talentInterest.count({ where: { talentId: talent.id } }),
    ).toBe(1);
  });

  it('refuses a selection pointing at an interest that no longer exists', async () => {
    const talent = await makeTalent();

    expect(
      await validateTalentInterests(talent.id, {
        techInterestIds: ['gone'],
        generalInterestIds: [],
      }),
    ).toEqual({ ok: false, reason: 'stale_tech' });

    expect(
      await validateTalentInterests(talent.id, {
        techInterestIds: [],
        generalInterestIds: ['gone'],
      }),
    ).toEqual({ ok: false, reason: 'stale_general' });

    // Nothing was written on either refusal.
    expect(
      await prisma.talentInterest.count({ where: { talentId: talent.id } }),
    ).toBe(0);
  });

  it('provisions a parent login, refreshes its name, and refuses an address held by another role', async () => {
    const parentEmail = `parent.${stamp}@example.test`;

    expect(
      await ensureParentAccount({
        email: parentEmail,
        prenom: 'Marie',
        nom: 'Dupont',
      }),
    ).toBe('created');
    const created = await prisma.bauth_user.findUnique({
      where: { email: parentEmail },
    });
    userIds.push(created!.id);
    expect(created?.role).toBe('parent');
    expect(created?.emailVerified).toBe(true);

    expect(
      await ensureParentAccount({
        email: parentEmail,
        prenom: 'Marie-Claire',
        nom: 'Dupont',
      }),
    ).toBe('refreshed');
    expect(
      (await prisma.bauth_user.findUnique({ where: { email: parentEmail } }))
        ?.name,
    ).toBe('Marie-Claire Dupont');

    // A student's (or staff member's) address can never also host a parent login:
    // one email, one account, one role.
    const studentEmail = `student.${stamp}@example.test`;
    const student = await prisma.bauth_user.create({
      data: { email: studentEmail, role: 'student' },
    });
    userIds.push(student.id);
    expect(
      await ensureParentAccount({
        email: studentEmail,
        prenom: 'Jean',
        nom: 'Martin',
      }),
    ).toBe('refused');
  });

  it('counts each talent on exactly one funnel rung, matching the ladder', async () => {
    // Fresh event so this cohort is only what this test creates.
    const event = await prisma.event.create({
      data: {
        titre: `Test Funnel Event ${stamp}`,
        campusId,
        date: new Date('2026-03-01T09:00:00.000Z'),
      },
    });

    const enrol = async (data: Record<string, Date | null>) => {
      const talent = await prisma.talent.create({
        data: { nom: 'Funnel', prenom: 'Test', ...data },
      });
      talentIds.push(talent.id);
      await prisma.participation.create({
        data: { talentId: talent.id, eventId: event.id, campusId },
      });
    };

    const now = new Date();
    await enrol({}); // blocked at identity
    await enrol({ infoValidatedAt: now }); // blocked at school
    await enrol({
      infoValidatedAt: now,
      highSchoolValidatedAt: now,
      parentsValidatedAt: now,
      techInterestsValidatedAt: now,
      // general still missing -> the interests rung, which needs both
    });
    await enrol({
      infoValidatedAt: now,
      highSchoolValidatedAt: now,
      parentsValidatedAt: now,
      techInterestsValidatedAt: now,
      generalInterestsValidatedAt: now,
      equipmentValidatedAt: now,
      processingCompletedAt: now,
      rulesSignedAt: now,
      charterAcceptedAt: now,
    }); // done

    // Scoped the way a real caller does it, so the id-to-scope resolution is
    // exercised against real rows too, not just the counting SQL.
    const funnel = await getOnboardingFunnel(
      await resolveScope({ eventId: event.id }),
    );

    const blockedBy = new Map(
      funnel.rungs.value.map((r) => [r.step, r.blocked]),
    );
    expect(funnel.cohort.value).toBe(4);
    expect(funnel.completed.value).toBe(1);
    expect(funnel.inProgress.value).toBe(3);
    expect(blockedBy.get('identity')).toBe(1);
    expect(blockedBy.get('school')).toBe(1);
    expect(blockedBy.get('interests')).toBe(1);
    expect(blockedBy.get('parents')).toBe(0);
    // Every unfinished talent lands on exactly one rung: the rungs partition the
    // cohort, which is what makes the numbers addable.
    const totalBlocked = funnel.rungs.value.reduce((s, r) => s + r.blocked, 0);
    expect(totalBlocked).toBe(funnel.inProgress.value);

    // The event is named back by its own label, never by the raw id it was
    // addressed with.
    expect(funnel.filters.event).toBe(event.titre);

    // An id nobody knows is refused before any counting happens: the answer must
    // never be a cohort of zero that reads like a real, empty event.
    await expect(
      resolveScope({ eventId: `evt_absent_${stamp}` }),
    ).rejects.toBeInstanceOf(UnknownScopeError);

    await prisma.event.delete({ where: { id: event.id } }).catch(() => {});
  });
});
