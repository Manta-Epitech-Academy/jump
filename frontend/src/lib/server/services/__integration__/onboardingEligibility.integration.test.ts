import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { getOnboardingFunnel } from '../adminStats/onboardingFunnel';
import { getCohortProfile } from '../adminStats/cohortProfile';
import { resolveScope } from '$lib/server/adminApi/scope';
import {
  patchCurrentOnboardingRecord,
  type OnboardingRecordPatch,
} from '../onboardingYearService';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';

/**
 * Collégiens have no onboarding, by seminar decision. Counted into the funnel
 * they would sit on its first rung for good, so the completion rate would fall
 * on its own the day Coding Clubs return - a figure that reads as a platform
 * problem and is in fact an artefact of the denominator.
 *
 * That regression is dated (2026-09-15) rather than triggered by a code change,
 * which is exactly why it is pinned here.
 */
describe('onboarding aggregates exclude collégiens (integration)', () => {
  const stamp = Date.now();
  let campusId = '';
  let eventId = '';
  const campusName = `Test Campus EL ${stamp}`;
  const schoolYear = currentSchoolYearLabel();
  const talentIds: string[] = [];

  /** Every ladder gate set: a talent who finished the whole thing. */
  const completed: OnboardingRecordPatch = {
    infoValidatedAt: new Date(),
    highSchoolValidatedAt: new Date(),
    parentsValidatedAt: new Date(),
    techInterestsValidatedAt: new Date(),
    generalInterestsValidatedAt: new Date(),
    equipmentValidatedAt: new Date(),
    processingCompletedAt: new Date(),
    rulesSignedAt: new Date(),
  };

  async function makeTalent(
    niveau: string | null,
    dossier?: OnboardingRecordPatch,
  ) {
    const talent = await prisma.talent.create({
      data: {
        nom: 'Test',
        prenom: 'Eligib',
        niveau,
        // Accepted alongside the règlement, and kept off the dossier: the charte
        // is a once-per-account consent, not a yearly one.
        charterAcceptedAt: dossier ? new Date() : null,
      },
    });
    talentIds.push(talent.id);
    // Written through the real path, which files the dossier row and refreshes
    // the projection from it. Setting the flat columns directly would seed a
    // state the runtime cannot produce - and the first wizard step this talent
    // took would then wipe the projection down to that one field.
    if (dossier) {
      await prisma.$transaction((tx) =>
        patchCurrentOnboardingRecord(tx, talent.id, dossier),
      );
    }
    await prisma.participation.create({
      data: { talentId: talent.id, eventId, campusId },
    });
    return talent;
  }

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: {
        name: campusName,
        externalName: `TEST_CAMPUS_EL_${stamp}`,
      },
    });
    campusId = campus.id;
    const event = await prisma.event.create({
      data: { titre: `Test Event EL ${stamp}`, date: new Date(), campusId },
    });
    eventId = event.id;

    // One lycéen who finished, one who has not, one collégien who never will.
    await makeTalent('2nde', completed);
    await makeTalent('1ere');
    await makeTalent('4eme');
  });

  afterAll(async () => {
    await prisma.participation.deleteMany({
      where: { talentId: { in: talentIds } },
    });
    await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it('keeps the collégien out of every funnel rung and out of the cohort', async () => {
    const funnel = await getOnboardingFunnel(await resolveScope({ eventId }));

    expect(funnel.cohort.value).toBe(2);
    expect(funnel.completed.value).toBe(1);
    expect(funnel.inProgress.value).toBe(1);

    // The one talent mid-flow is the lycéen, stopped on the first rung. If the
    // collégien leaked in, this would be 2.
    const blocked = funnel.rungs.value.filter((r) => r.blocked > 0);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.step).toBe('identity');
    expect(blocked[0]?.blocked).toBe(1);

    // The rungs must still account for everyone who is in.
    const totalBlocked = funnel.rungs.value.reduce(
      (sum, r) => sum + r.blocked,
      0,
    );
    expect(totalBlocked).toBe(funnel.inProgress.value);
  });

  it('reports the excluded talents rather than dropping them silently', async () => {
    // A consumer comparing this funnel to any other cohort figure would see a
    // gap; the answer has to explain it itself, not leave it to be discovered.
    const funnel = await getOnboardingFunnel(await resolveScope({ eventId }));
    expect(funnel.horsParcours.value).toBe(1);
    expect(funnel.horsParcours.definition).toMatch(/collégiens/i);
  });

  it('rates completion against the talents who have a dossier', async () => {
    const profile = await getCohortProfile(await resolveScope({ eventId }));

    // Cohort keeps everyone; the rate divides by the two who are concerned.
    expect(profile.cohort.value).toBe(3);
    expect(profile.onboardingNotApplicable.value).toBe(1);
    expect(profile.onboardingCompleted.value).toBe(1);
    // 1 of 2, not 1 of 3: the collégien cannot move this number either way.
    expect(profile.onboardingCompletedShare.value).toBe(50);
  });

  it('scopes the same way for a whole school year', async () => {
    // Pinned to this test's campus as well: a bare school year sweeps in every
    // event the rest of the suite creates, and the counts stop meaning anything.
    const funnel = await getOnboardingFunnel(
      await resolveScope({ schoolYear, campus: campusName }),
    );
    expect(funnel.horsParcours.value).toBe(1);
    expect(funnel.cohort.value).toBe(2);
    expect(funnel.completed.value).toBe(1);
  });
});
