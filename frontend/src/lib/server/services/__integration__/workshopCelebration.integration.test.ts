import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import {
  applyWorkshopProgress,
  getUnseenWorkshopReward,
  markWorkshopRewardsSeen,
} from '$lib/server/services/workshopService';
import { POST as ackRoute } from '../../../../routes/api/workshops/rewards-seen/+server';
import { assertTestDatabase } from './testDatabase';

/**
 * What the dashboard celebrates when a talent comes back from an activity, held
 * against what the ledger actually paid.
 *
 * Every case below is one that shipped wrong. The celebration used to be a
 * counter of its own, raised by the difference each callback made to the grant
 * and zeroed whole by the acknowledgement, and nothing kept it in step with the
 * grant: concurrent callbacks each added the same difference, a progress that
 * fell and climbed back was paid for its climb twice, and XP arriving while the
 * animation played were acknowledged without ever being shown. The talent read
 * one figure on the toast and a smaller one on the profile.
 *
 * So every assertion compares the toast with the movement of `Talent.xp`, the
 * projection the profile card reads, rather than with a number written here.
 */
describe('the activity XP celebration (integration)', () => {
  const stamp = Date.now();
  const BUDGET_MINUTES = 60;
  const created = {
    campusIds: [] as string[],
    eventIds: [] as string[],
    instanceIds: [] as string[],
    talentIds: [] as string[],
  };

  let campusId = '';
  let eventId = '';

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: { name: `Test Celebration Campus ${stamp}` },
    });
    campusId = campus.id;
    created.campusIds.push(campusId);
    const event = await prisma.event.create({
      data: {
        titre: 'Test Celebration Event',
        campusId,
        date: new Date('2026-09-01T09:00:00.000Z'),
      },
    });
    eventId = event.id;
    created.eventIds.push(eventId);
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({
        where: { id: { in: created.talentIds } },
      });
      await prisma.eventConfig_Workshop.deleteMany({
        where: { instanceId: { in: created.instanceIds } },
      });
      await prisma.workshop_Instance.deleteMany({
        where: { id: { in: created.instanceIds } },
      });
      await prisma.event.deleteMany({
        where: { id: { in: created.eventIds } },
      });
      await prisma.campus.deleteMany({
        where: { id: { in: created.campusIds } },
      });
    } catch {
      // ignore: the test database is disposable
    }
  });

  /** One talent who has entered one activity, sixty minutes long. */
  async function enteredTalent() {
    const n = created.talentIds.length;
    const slug = `test-celebration-${stamp}-${n}`;
    const instance = await prisma.workshop_Instance.create({
      data: {
        slug,
        label: 'Atelier de test',
        baseUrl: 'https://test.ctfd.invalid',
      },
    });
    created.instanceIds.push(instance.id);
    await prisma.eventConfig_Workshop.create({
      data: {
        eventId,
        instanceId: instance.id,
        position: n,
        durationMinutes: BUDGET_MINUTES,
      },
    });
    const talent = await prisma.talent.create({
      data: { prenom: 'Camille', nom: `Fête ${n}` },
    });
    created.talentIds.push(talent.id);
    await prisma.participation.create({
      data: { talentId: talent.id, eventId, campusId },
    });
    await prisma.workshop_Participation.create({
      data: {
        talentId: talent.id,
        instanceId: instance.id,
        eventId,
        campusId,
        budgetMinutes: BUDGET_MINUTES,
      },
    });

    const talentId = talent.id;
    return {
      talentId,
      /** What CTFd reports: the whole state, recounted at send time. */
      report: (solvedSteps: number, totalSteps: number) =>
        applyWorkshopProgress({
          instanceSlug: slug,
          talentId,
          solvedSteps,
          totalSteps,
          isComplete: solvedSteps === totalSteps,
        }),
      profileXp: async () =>
        (
          await prisma.talent.findUniqueOrThrow({
            where: { id: talentId },
            select: { xp: true },
          })
        ).xp,
      /** Load the dashboard, then acknowledge exactly what it showed. */
      celebrate: async () => {
        const reward = await getUnseenWorkshopReward(talentId);
        if (reward) await markWorkshopRewardsSeen(talentId, reward.upTo);
        return reward?.xp ?? 0;
      },
    };
  }

  it('celebrates the first progress for what it paid', async () => {
    const t = await enteredTalent();
    await t.report(3, 12);
    expect(await t.profileXp()).toBe(150);
    expect(await t.celebrate()).toBe(150);
    // Acknowledged once, gone: a reload or a returning tab finds nothing.
    expect(await getUnseenWorkshopReward(t.talentId)).toBeNull();
  });

  it('celebrates concurrent copies of one callback once', async () => {
    // A resend whose first attempt is still in flight, or an admin pressing
    // « resend » on CTFd's outbox: the same report, at the same time.
    const t = await enteredTalent();
    await Promise.all([t.report(1, 12), t.report(1, 12), t.report(1, 12)]);
    expect(await t.profileXp()).toBe(50);
    expect(await t.celebrate()).toBe(50);

    await Promise.all([t.report(2, 12), t.report(2, 12)]);
    expect(await t.celebrate()).toBe(50);
    expect(await t.profileXp()).toBe(100);
  });

  it('celebrates only the net gain when progress falls and climbs back', async () => {
    // A CTFd instance reset between two sessions: the recount starts again from
    // the bottom, and the grant follows it down.
    const t = await enteredTalent();
    await t.report(6, 12);
    await t.celebrate();
    const before = await t.profileXp();

    await t.report(1, 12);
    await t.report(7, 12);
    const gain = (await t.profileXp()) - before;
    expect(gain).toBe(50);
    expect(await t.celebrate()).toBe(gain);
  });

  it('celebrates nothing while progress has not passed what was shown', async () => {
    const t = await enteredTalent();
    await t.report(6, 12);
    await t.celebrate();
    await t.report(1, 12);
    await t.report(6, 12);
    // Back exactly where the talent already was: no XP were gained.
    expect(await getUnseenWorkshopReward(t.talentId)).toBeNull();
  });

  it('celebrates only the net gain when the subject grows', async () => {
    // A re-sync adds steps: the same solves are worth less, then more again.
    const t = await enteredTalent();
    await t.report(6, 12);
    await t.celebrate();
    const before = await t.profileXp();

    await t.report(6, 15);
    await t.report(8, 15);
    const gain = (await t.profileXp()) - before;
    expect(gain).toBe(20);
    expect(await t.celebrate()).toBe(gain);
  });

  it('keeps XP that arrive during the animation for the next return', async () => {
    const t = await enteredTalent();
    await t.report(1, 12);
    const shown = await getUnseenWorkshopReward(t.talentId);
    expect(shown?.xp).toBe(50);

    // The next step lands between the load and the acknowledgement.
    await t.report(3, 12);
    await markWorkshopRewardsSeen(t.talentId, shown!.upTo);

    expect((await getUnseenWorkshopReward(t.talentId))?.xp).toBe(100);
  });

  it('cannot replay a celebration from a stale acknowledgement', async () => {
    // A tab left open since an earlier load acknowledges less than another tab
    // already has. The mark only ever rises.
    const t = await enteredTalent();
    await t.report(1, 12);
    const stale = (await getUnseenWorkshopReward(t.talentId))!.upTo;
    await t.report(4, 12);
    await t.celebrate();

    await markWorkshopRewardsSeen(t.talentId, stale);
    expect(await getUnseenWorkshopReward(t.talentId)).toBeNull();
  });

  describe('the acknowledgement route', () => {
    async function ack(body: unknown, talentId: string | null) {
      const request = new Request(
        'http://localhost/api/workshops/rewards-seen',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      try {
        const response = await ackRoute({
          request,
          locals: { talent: talentId ? { id: talentId } : null },
        } as unknown as Parameters<typeof ackRoute>[0]);
        return response.status;
      } catch (err) {
        if (isHttpError(err)) return err.status;
        throw err;
      }
    }

    it('acknowledges what the dashboard sends back', async () => {
      const t = await enteredTalent();
      await t.report(2, 12);
      const reward = await getUnseenWorkshopReward(t.talentId);
      expect(await ack({ upTo: reward!.upTo }, t.talentId)).toBe(200);
      expect(await getUnseenWorkshopReward(t.talentId)).toBeNull();
    });

    it('refuses a caller who is not a talent', async () => {
      expect(await ack({ upTo: [] }, null)).toBe(401);
    });

    it('refuses a body it cannot read, and acknowledges nothing', async () => {
      const t = await enteredTalent();
      await t.report(2, 12);
      expect(await ack({}, t.talentId)).toBe(400);
      expect(
        await ack({ upTo: [{ instanceId: 'x', amount: -5 }] }, t.talentId),
      ).toBe(400);
      expect((await getUnseenWorkshopReward(t.talentId))?.xp).toBe(100);
    });
  });
});
