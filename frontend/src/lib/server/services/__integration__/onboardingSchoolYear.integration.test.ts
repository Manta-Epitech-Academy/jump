import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';
import {
  getOnboardingStep,
  onboardingFieldsForYear,
} from '$lib/domain/talentOnboarding';
import {
  patchCurrentOnboardingRecord,
  upsertOnboardingYearRecord,
} from '../onboardingYearService';
import { getOnboardingFunnel } from '../adminStats/onboardingFunnel';
import { signOnboardingRules } from '../onboardingService';
import { CURRENT_REGLEMENT_VERSION } from '$lib/content/reglement';
import { resolveScope } from '$lib/server/adminApi/scope';

/**
 * The onboarding dossier is per school year, and this is the invariant the model
 * exists for: a talent coming back after the summer re-walks the ladder and
 * re-signs the current règlement, and the dossier they filed last year is still
 * there afterwards, unchanged.
 *
 * The two halves are tested together on purpose. Making the talent walk again is
 * easy to get right by wiping the columns; what that would destroy is the
 * history, which is the other half of the same decision.
 */
describe('onboarding dossier per school year (integration)', () => {
  const stamp = Date.now();
  const currentYear = currentSchoolYearLabel();
  const lastYearStart = Number(currentYear.slice(0, 4)) - 1;
  const lastYear = `${lastYearStart}-${lastYearStart + 1}`;

  let campusId = '';
  const campusName = `Test Campus OY ${stamp}`;
  let lastYearEventId = '';
  let currentYearEventId = '';
  let talentId = '';
  /** Finished last year too, but their guardian never co-signed. */
  let laggingTalentId = '';

  const signedLastYear = new Date(Date.UTC(lastYearStart + 1, 2, 3));

  /** Every gate set, as the wizard leaves them when it is finished. */
  const finishedDossier = {
    infoValidatedAt: signedLastYear,
    highSchoolValidatedAt: signedLastYear,
    parentsValidatedAt: signedLastYear,
    techInterestsValidatedAt: signedLastYear,
    generalInterestsValidatedAt: signedLastYear,
    interestsRecapSeenAt: signedLastYear,
    equipmentValidatedAt: signedLastYear,
    processingCompletedAt: signedLastYear,
    rulesSignedAt: signedLastYear,
    rulesSignedCity: 'Lille',
    reglementVersion: '2025-2026',
  };

  async function readTalent() {
    return prisma.talent.findUniqueOrThrow({ where: { id: talentId } });
  }

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: {
        name: campusName,
        externalName: `TEST_CAMPUS_OY_${stamp}`,
      },
    });
    campusId = campus.id;

    // 15 January always falls inside the school year that opened the previous
    // 31 July, so both events land in the year their name says without hardcoding
    // a calendar date.
    const lastYearEvent = await prisma.event.create({
      data: {
        titre: `Test Event OY last ${stamp}`,
        date: new Date(Date.UTC(lastYearStart + 1, 0, 15)),
        campusId,
      },
    });
    lastYearEventId = lastYearEvent.id;
    const currentYearEvent = await prisma.event.create({
      data: {
        titre: `Test Event OY current ${stamp}`,
        date: new Date(Date.UTC(lastYearStart + 2, 0, 15)),
        campusId,
      },
    });
    currentYearEventId = currentYearEvent.id;

    // A talent who finished last year and has enrolled again this year. The
    // projection is written here rather than through `upsertOnboardingYearRecord`
    // because that service refuses to project a year that is not the current one
    // - which is the behaviour under test. This is the state the wizard left
    // behind while `lastYear` WAS current, and the state the backfill produces.
    const talent = await prisma.talent.create({
      data: {
        nom: 'Revenant',
        prenom: 'Test',
        niveau: '1ere',
        charterAcceptedAt: signedLastYear,
        onboardingSchoolYear: lastYear,
        ...finishedDossier,
        onboardingRecords: {
          create: { schoolYear: lastYear, ...finishedDossier },
        },
      },
    });
    talentId = talent.id;

    const lagging = await prisma.talent.create({
      data: {
        nom: 'Attente',
        prenom: 'Test',
        niveau: '1ere',
        charterAcceptedAt: signedLastYear,
        onboardingSchoolYear: lastYear,
        ...finishedDossier,
        onboardingRecords: {
          create: { schoolYear: lastYear, ...finishedDossier },
        },
      },
    });
    laggingTalentId = lagging.id;

    await prisma.participation.createMany({
      data: [
        { talentId, eventId: lastYearEventId, campusId },
        { talentId, eventId: currentYearEventId, campusId },
      ],
    });
  });

  afterAll(async () => {
    const ids = [talentId, laggingTalentId];
    await prisma.onboardingPdfJob.deleteMany({
      where: { talentId: { in: ids } },
    });
    await prisma.xpGrant.deleteMany({ where: { talentId: { in: ids } } });
    await prisma.participation.deleteMany({ where: { talentId: { in: ids } } });
    await prisma.onboarding_Record.deleteMany({
      where: { talentId: { in: ids } },
    });
    await prisma.talent.deleteMany({ where: { id: { in: ids } } });
    await prisma.event.deleteMany({
      where: { id: { in: [lastYearEventId, currentYearEventId] } },
    });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it('reads last year’s dossier as nothing done for this year', async () => {
    const talent = await readTalent();

    expect(getOnboardingStep(onboardingFieldsForYear(talent, lastYear))).toBe(
      null,
    );
    expect(
      getOnboardingStep(onboardingFieldsForYear(talent, currentYear)),
    ).toBe('identity');

    // The two once-per-account gates survive, so the talent is not asked to
    // re-accept the charte nor shown the welcome splash again.
    expect(
      onboardingFieldsForYear(talent, currentYear).charterAcceptedAt,
    ).not.toBeNull();

    // And the interests step will start from a blank slate rather than last
    // year's picks: `interestsRecapSeenAt` is what the wizard's pre-fill reads.
    expect(
      onboardingFieldsForYear(talent, currentYear).interestsRecapSeenAt,
    ).toBeNull();
  });

  it('opens this year’s dossier without touching last year’s', async () => {
    await prisma.$transaction((tx) =>
      patchCurrentOnboardingRecord(tx, talentId, {
        infoValidatedAt: new Date(),
      }),
    );

    const talent = await readTalent();
    // The projection is now this year's, and holds only what this year has done.
    expect(talent.onboardingSchoolYear).toBe(currentYear);
    expect(talent.infoValidatedAt).not.toBeNull();
    expect(talent.rulesSignedAt).toBeNull();
    expect(talent.rulesSignedCity).toBeNull();
    expect(talent.reglementVersion).toBeNull();
    expect(
      getOnboardingStep(onboardingFieldsForYear(talent, currentYear)),
    ).toBe('school');

    // Last year's dossier is untouched: same signature, same city, same version
    // of the règlement. This is the half a column wipe would have destroyed.
    const previous = await prisma.onboarding_Record.findUniqueOrThrow({
      where: { talentId_schoolYear: { talentId, schoolYear: lastYear } },
    });
    expect(previous.rulesSignedAt).toEqual(signedLastYear);
    expect(previous.rulesSignedCity).toBe('Lille');
    expect(previous.reglementVersion).toBe('2025-2026');
  });

  it('answers the funnel with each year’s own dossier', async () => {
    // Runs after the step above, so the talent is mid-flow this year and done
    // last year. Both scopes are pinned to this test's own campus: the school
    // year alone would sweep in every event the rest of the suite creates.
    const past = await getOnboardingFunnel(
      await resolveScope({ schoolYear: lastYear, campus: campusName }),
    );
    expect(past.cohort.value).toBe(1);
    // Still complete for last year, although the same talent has since opened a
    // new dossier. Read off the projection this would be 0: that is the history
    // being overwritten, one aggregate at a time.
    expect(past.completed.value).toBe(1);
    expect(past.inProgress.value).toBe(0);

    const now = await getOnboardingFunnel(
      await resolveScope({ schoolYear: currentYear, campus: campusName }),
    );
    expect(now.cohort.value).toBe(1);
    expect(now.completed.value).toBe(0);
    const blocked = now.rungs.value.filter((r) => r.blocked > 0);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.step).toBe('school');
  });

  it('projects a co-signature that lands on a dossier the clock has passed', async () => {
    // The guardian is late: the child's règlement was signed last year and the
    // 31 July cutover has been and gone. The co-signature belongs to the dossier
    // the child actually has, and it has to reach the projection - the parent
    // portal reads it there, so a skipped refresh would ask them to sign again on
    // their next visit, and on every visit after that.
    const signedNow = new Date();
    await prisma.$transaction((tx) =>
      upsertOnboardingYearRecord(tx, {
        talentId: laggingTalentId,
        schoolYear: lastYear,
        patch: {
          parentRulesSignedAt: signedNow,
          parentRulesSignerPrenom: 'Sophie',
          parentRulesSignerNom: 'Martin',
        },
      }),
    );

    const talent = await prisma.talent.findUniqueOrThrow({
      where: { id: laggingTalentId },
    });
    expect(talent.parentRulesSignedAt).toEqual(signedNow);
    // Still last year's dossier: a co-signature does not move the talent into
    // the year in progress, it completes the one they were in.
    expect(talent.onboardingSchoolYear).toBe(lastYear);
  });

  it('refuses to project a dossier older than the one the talent has', async () => {
    // `talentId` opened this year's dossier in the test above. A late write to
    // last year's must not drag the projection backwards and hand them back a
    // règlement they have to sign again.
    const twoYearsAgo = `${lastYearStart - 1}-${lastYearStart}`;
    await prisma.$transaction((tx) =>
      upsertOnboardingYearRecord(tx, {
        talentId,
        schoolYear: twoYearsAgo,
        patch: { rulesSignedAt: new Date('2024-05-05T00:00:00Z') },
      }),
    );

    const talent = await prisma.talent.findUniqueOrThrow({
      where: { id: talentId },
    });
    expect(talent.onboardingSchoolYear).toBe(currentYear);
    expect(talent.rulesSignedAt).toBeNull();
  });

  it('signs this year’s règlement without restamping the charte', async () => {
    // The charte is a once-per-account consent, so the second signature pins the
    // current wording on the new dossier and leaves the date the talent first
    // consented exactly where it was. Restamping it would quietly rewrite the
    // only record of when consent was actually given, for every talent who comes
    // back - and the wizard, which stops asking for it, would be claiming a
    // consent it just overwrote.
    await signOnboardingRules({
      talentId,
      studentName: 'Test Revenant',
      city: 'Lyon',
    });

    const talent = await readTalent();
    expect(talent.charterAcceptedAt?.toISOString()).toBe(
      signedLastYear.toISOString(),
    );
    expect(talent.onboardingSchoolYear).toBe(currentYear);
    expect(talent.reglementVersion).toBe(CURRENT_REGLEMENT_VERSION);

    const records = await prisma.onboarding_Record.findMany({
      where: { talentId },
      orderBy: { schoolYear: 'asc' },
      select: {
        schoolYear: true,
        reglementVersion: true,
        rulesSignedCity: true,
      },
    });
    expect(records).toEqual(
      expect.arrayContaining([
        {
          schoolYear: lastYear,
          reglementVersion: '2025-2026',
          rulesSignedCity: 'Lille',
        },
        {
          schoolYear: currentYear,
          reglementVersion: CURRENT_REGLEMENT_VERSION,
          rulesSignedCity: 'Lyon',
        },
      ]),
    );
  });
});
