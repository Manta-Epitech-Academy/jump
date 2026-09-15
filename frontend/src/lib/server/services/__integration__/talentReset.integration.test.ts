import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { workshopGrantSourceId } from '$lib/domain/workshops';
import { resetTalentToImport } from '$lib/server/services/talentAccount';
import { assertTestDatabase } from './testDatabase';

/**
 * What a reset to import leaves behind, for the one shape that can pay a talent
 * twice.
 *
 * The reset enumerates the talent-scoped tables by hand, which is the only thing
 * it can do and the reason a new one gets forgotten: `Workshop_Participation`
 * was, and the omission is invisible in a diff because the row it leaves is
 * well-formed. It costs an arrears (`xpPending`) that survives the `XpGrant`
 * delete, so the next dashboard load floats XP the ledger no longer holds, and a
 * `budgetMinutes` snapshot that outlives the reset it was supposed to be undone
 * by.
 *
 * Asserted through `resetTalentToImport` rather than over a list of table names:
 * a test that restated the enumeration would pass by agreeing with the bug.
 */
describe('resetting a talent to import (integration)', () => {
  const stamp = Date.now();
  const slug = `test-reset-workshop-${stamp}`;

  let campusId = '';
  let eventId = '';
  let instanceId = '';
  let talentId = '';

  beforeAll(async () => {
    assertTestDatabase();

    const campus = await prisma.campus.create({
      data: { name: `Test Reset Campus ${stamp}` },
    });
    campusId = campus.id;
    const event = await prisma.event.create({
      data: {
        titre: 'Test Reset Event',
        campusId,
        date: new Date('2026-09-01T09:00:00.000Z'),
      },
    });
    eventId = event.id;
    const instance = await prisma.workshop_Instance.create({
      data: {
        slug,
        label: 'Atelier de test',
        baseUrl: 'https://reset.ctfd.invalid',
      },
    });
    instanceId = instance.id;
    const talent = await prisma.talent.create({
      data: { prenom: 'Camille', nom: 'Réinitialisée' },
    });
    talentId = talent.id;

    // The enrolment the worker wrote, which the reset keeps: it is what still
    // offers the activity afterwards, and therefore what makes a stale mirror
    // visible rather than merely present.
    await prisma.participation.create({
      data: { talentId, eventId, campusId },
    });

    // Mid-activity, with XP that arrived while the Jump tab was in the
    // background: the state this feature creates, and the one an admin resets a
    // talent out of.
    await prisma.workshop_Participation.create({
      data: {
        talentId,
        instanceId,
        eventId,
        campusId,
        budgetMinutes: 120,
        solvedSteps: 6,
        totalSteps: 15,
        xpPending: 480,
      },
    });
    await prisma.xpGrant.create({
      data: {
        talentId,
        campusId,
        source: 'workshop',
        sourceId: workshopGrantSourceId(slug, talentId),
        amount: 480,
      },
    });
    await prisma.talent.update({ where: { id: talentId }, data: { xp: 480 } });
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({ where: { id: talentId } });
      await prisma.workshop_Instance.deleteMany({ where: { id: instanceId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('leaves no activity able to pay or celebrate a second time', async () => {
    await resetTalentToImport(talentId);

    const [participation, grants, talent] = await Promise.all([
      prisma.workshop_Participation.findUnique({
        where: { talentId_instanceId: { talentId, instanceId } },
      }),
      prisma.xpGrant.count({ where: { talentId } }),
      prisma.talent.findUnique({
        where: { id: talentId },
        select: { xp: true },
      }),
    ]);

    // The mirror goes with the ledger. Kept, it would float 480 XP over a
    // profile card reading 0 and report "6 / 15 étapes validées" for a talent
    // returned to import.
    expect(participation).toBeNull();
    expect(grants).toBe(0);
    expect(talent?.xp).toBe(0);

    // The enrolment is the worker's and stays, so the activity is still offered:
    // that is what makes re-entry the path back in, and re-entry is what takes a
    // fresh budget snapshot.
    expect(
      await prisma.participation.count({ where: { talentId, eventId } }),
    ).toBe(1);
  });
});
