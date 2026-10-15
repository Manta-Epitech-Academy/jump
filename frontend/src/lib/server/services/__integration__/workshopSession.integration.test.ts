import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import {
  enterWorkshop,
  type WorkshopEntry,
} from '$lib/server/services/workshopService';
import { assertTestDatabase } from './testDatabase';

/**
 * The session an entry ticket names, which is the one the plugin files the CTFd
 * account under and keeps to itself.
 *
 * A talent who comes back to an activity through a later event is let in on that
 * later enrolment, but their participation, their XP and their CTFd account all
 * stay with the first one. The ticket has to name the first one too, or the
 * plugin would be told about a session the account will never be filed in.
 *
 * The pin belongs to the CONTENT, not to the host: when the same host serves the
 * next content, a regular entering it through a later event is in that later
 * event's session, on that event's budget.
 */
describe('the session an activity entry names (integration)', () => {
  const stamp = Date.now();
  const hostSlug = `test-host-session-${stamp}`;
  const slug = `test-workshop-session-${stamp}`;
  const nextSlug = `test-workshop-session-next-${stamp}`;
  let campusId = '';
  let firstEventId = '';
  let laterEventId = '';
  let instanceId = '';
  let activityId = '';
  let nextActivityId = '';
  let talentId = '';

  const entryFor = (
    eventId: string,
    activity = { id: activityId, slug },
    budgetMinutes = 120,
  ): WorkshopEntry => ({
    activityId: activity.id,
    activitySlug: activity.slug,
    instanceSlug: hostSlug,
    baseUrl: 'https://test.ctfd.invalid',
    eventId,
    campusId,
    budgetMinutes,
  });

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: { name: `Test Session Campus ${stamp}`, timezone: 'Europe/Paris' },
    });
    campusId = campus.id;
    const [first, later] = await Promise.all([
      prisma.event.create({
        data: {
          titre: 'SF Coding Club octobre',
          publicName: 'Coding Club octobre',
          campusId,
          date: new Date('2026-10-14T00:00:00.000Z'),
        },
      }),
      prisma.event.create({
        data: {
          titre: 'Coding Club mars',
          campusId,
          date: new Date('2027-03-10T00:00:00.000Z'),
        },
      }),
    ]);
    firstEventId = first.id;
    laterEventId = later.id;
    const instance = await prisma.workshop_Instance.create({
      data: { slug: hostSlug, baseUrl: 'https://test.ctfd.invalid' },
    });
    instanceId = instance.id;
    const [activity, next] = await Promise.all([
      prisma.workshop_Activity.create({
        data: { slug, instanceId, label: 'Atelier de test' },
      }),
      prisma.workshop_Activity.create({
        data: { slug: nextSlug, instanceId, label: 'Atelier suivant' },
      }),
    ]);
    activityId = activity.id;
    nextActivityId = next.id;
    const talent = await prisma.talent.create({
      data: { prenom: 'Camille', nom: 'Session' },
    });
    talentId = talent.id;
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({ where: { id: talentId } });
      await prisma.workshop_Activity.deleteMany({
        where: { id: { in: [activityId, nextActivityId] } },
      });
      await prisma.workshop_Instance.deleteMany({ where: { id: instanceId } });
      await prisma.event.deleteMany({
        where: { id: { in: [firstEventId, laterEventId] } },
      });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('names the event of the first entry, with its public name, date and campus', async () => {
    const session = await enterWorkshop(
      talentId,
      entryFor(firstEventId, { id: activityId, slug }),
    );
    expect(session).toEqual({
      id: firstEventId,
      label: 'Coding Club octobre (14/10/2026)',
      campusId,
      campusLabel: `Test Session Campus ${stamp}`,
    });
  });

  it('keeps naming the first event when the talent comes back through a later one', async () => {
    const session = await enterWorkshop(
      talentId,
      entryFor(laterEventId, { id: activityId, slug }),
    );
    expect(session.id).toBe(firstEventId);
  });

  it('names the later event for the next content on the same host, on its budget', async () => {
    const session = await enterWorkshop(
      talentId,
      entryFor(laterEventId, { id: nextActivityId, slug: nextSlug }, 180),
    );
    expect(session.id).toBe(laterEventId);
    const pinned = await prisma.workshop_Participation.findMany({
      where: { talentId },
      select: { activityId: true, eventId: true, budgetMinutes: true },
    });
    expect(pinned).toEqual(
      expect.arrayContaining([
        { activityId, eventId: firstEventId, budgetMinutes: 120 },
        {
          activityId: nextActivityId,
          eventId: laterEventId,
          budgetMinutes: 180,
        },
      ]),
    );
  });
});
