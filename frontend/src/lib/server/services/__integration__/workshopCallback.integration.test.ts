import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { isHttpError } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { workshopKeys } from '$lib/server/workshops/ticket';
import { workshopGrantSourceId } from '$lib/domain/workshops';
import { getUnseenWorkshopReward } from '$lib/server/services/workshopService';
import { resolveGrantLabels } from '$lib/server/services/xpStoryService';
import { writeWorkshopActivity } from '$lib/server/adminApi/writes/workshops';
import { OperationRefusedError } from '$lib/server/adminApi/errors';
import { POST } from '../../../../routes/api/workshops/callback/+server';
import { assertTestDatabase } from './testDatabase';

/**
 * The inbound half of the CTFd contract, driven through the ROUTE and not
 * through the service.
 *
 * What is under test is the whole path: the signature over the bytes on the
 * wire, the freshness window, the shape check, and the single grant the service
 * recomputes. Calling `applyWorkshopProgress` directly would have skipped the
 * half that decides whether a request is allowed to write anything at all, which
 * is the half an unauthenticated public endpoint is judged on.
 */
describe('the workshop progress callback (integration)', () => {
  const stamp = Date.now();
  // The host, and the two contents it serves one after the other.
  const hostSlug = `test-host-${stamp}`;
  const slug = `test-workshop-${stamp}`;
  const nextSlug = `test-workshop-next-${stamp}`;
  const otherHostSlug = `test-other-host-${stamp}`;
  const secret = process.env.WORKSHOP_TICKET_SECRET ?? '';
  const BUDGET_MINUTES = 120;
  const TOTAL_STEPS = 15;

  let campusId = '';
  let eventId = '';
  let instanceId = '';
  let activityId = '';
  let nextActivityId = '';
  let talentId = '';
  let sourceId = '';

  function sign(rawBody: string, ts: number): string {
    const { callbackKey } = workshopKeys(secret);
    return (
      'sha256=' +
      createHmac('sha256', callbackKey).update(`${ts}.${rawBody}`).digest('hex')
    );
  }

  async function post(
    body: unknown,
    overrides: { ts?: number; signature?: string } = {},
  ): Promise<number> {
    const rawBody = JSON.stringify(body);
    const ts = overrides.ts ?? Math.floor(Date.now() / 1000);
    const request = new Request('http://localhost/api/workshops/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-timestamp': String(ts),
        'x-signature': overrides.signature ?? sign(rawBody, ts),
        'x-idempotency-key': `${slug}:${talentId}`,
      },
      body: rawBody,
    });
    try {
      // Only what this handler reads: it authenticates itself off the body and
      // the two headers, and touches neither `locals` nor the route params.
      const response = await POST({
        request,
      } as unknown as Parameters<typeof POST>[0]);
      return response.status;
    } catch (err) {
      if (isHttpError(err)) return err.status;
      throw err;
    }
  }

  const progress = (solvedSteps: number, contentSlug = slug) => ({
    instanceSlug: hostSlug,
    contentSlug,
    talentId,
    solvedSteps,
    totalSteps: TOTAL_STEPS,
    isComplete: solvedSteps >= TOTAL_STEPS,
  });

  const readState = async () => {
    const [grant, participation] = await Promise.all([
      prisma.xpGrant.findUnique({
        where: { source_sourceId: { source: 'workshop', sourceId } },
        select: { amount: true, createdAt: true },
      }),
      prisma.workshop_Participation.findUnique({
        where: { talentId_activityId: { talentId, activityId } },
        select: { solvedSteps: true, totalSteps: true },
      }),
    ]);
    // What the dashboard would celebrate on the talent's next return.
    const owed = (await getUnseenWorkshopReward(talentId))?.xp ?? 0;
    const grants = await prisma.xpGrant.count({
      where: { talentId, source: 'workshop' },
    });
    return { grant, participation, grants, owed };
  };

  beforeAll(async () => {
    assertTestDatabase();
    expect(
      secret,
      'WORKSHOP_TICKET_SECRET must be set: it is declared in frontend/.env.test.defaults, which `bun run test:integration` sources',
    ).not.toBe('');

    const campus = await prisma.campus.create({
      data: { name: `Test Workshop Campus ${stamp}` },
    });
    campusId = campus.id;
    const event = await prisma.event.create({
      data: {
        titre: 'Test Workshop Event',
        campusId,
        date: new Date('2026-09-01T09:00:00.000Z'),
      },
    });
    eventId = event.id;
    const instance = await prisma.workshop_Instance.create({
      data: { slug: hostSlug, baseUrl: 'https://test.ctfd.invalid' },
    });
    instanceId = instance.id;
    const activity = await prisma.workshop_Activity.create({
      data: { slug, instanceId, label: 'Atelier de test' },
    });
    activityId = activity.id;
    // What the same host serves next, once the first content is over.
    const next = await prisma.workshop_Activity.create({
      data: { slug: nextSlug, instanceId, label: 'Atelier suivant' },
    });
    nextActivityId = next.id;
    await prisma.eventConfig_Workshop.create({
      data: {
        eventId,
        activityId,
        position: 0,
        durationMinutes: BUDGET_MINUTES,
      },
    });
    const talent = await prisma.talent.create({
      data: { prenom: 'Camille', nom: 'Atelier' },
    });
    talentId = talent.id;
    sourceId = workshopGrantSourceId(slug, talentId);
    await prisma.participation.create({
      data: { talentId, eventId, campusId },
    });
    // The entry action writes this row; the callback never creates one, which is
    // what makes an unknown talent a silent no-op rather than a new participation.
    await prisma.workshop_Participation.create({
      data: {
        talentId,
        activityId,
        eventId,
        campusId,
        budgetMinutes: BUDGET_MINUTES,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({ where: { id: talentId } });
      await prisma.eventConfig_Workshop.deleteMany({ where: { activityId } });
      await prisma.workshop_Activity.deleteMany({
        where: { instance: { slug: { in: [hostSlug, otherHostSlug] } } },
      });
      await prisma.workshop_Instance.deleteMany({
        where: { slug: { in: [hostSlug, otherHostSlug] } },
      });
      await prisma.event.deleteMany({ where: { id: eventId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('refuses a body whose signature does not match, and writes nothing', async () => {
    expect(await post(progress(4), { signature: 'sha256=deadbeef' })).toBe(401);
    const { grant, participation } = await readState();
    expect(grant).toBeNull();
    expect(participation?.solvedSteps).toBe(0);
  });

  it('refuses a correctly signed body whose timestamp is stale', async () => {
    // A captured body stays valid for five minutes and no longer, which is what
    // stops a replay from an access log much later.
    const stale = Math.floor(Date.now() / 1000) - 600;
    expect(await post(progress(4), { ts: stale })).toBe(401);
    expect((await readState()).grant).toBeNull();
  });

  it('refuses a payload of the wrong shape', async () => {
    expect(
      await post({
        instanceSlug: hostSlug,
        contentSlug: slug,
        talentId,
        solvedSteps: 'quatre',
      }),
    ).toBe(400);
    expect(await post({ ...progress(4), solvedSteps: -1 })).toBe(400);
  });

  it('refuses a report that does not name its content', async () => {
    // An instance older than the content field: refused, so its outbox keeps
    // the row and resends it once upgraded, rather than Jump filing it under a
    // guess.
    const withoutContent: Record<string, unknown> = { ...progress(4) };
    delete withoutContent.contentSlug;
    expect(await post(withoutContent)).toBe(400);
    expect(await post({ ...progress(4), contentSlug: '' })).toBe(400);
    expect((await readState()).grants).toBe(0);
  });

  it('grants nothing for a content Jump does not know', async () => {
    expect(await post(progress(4, `unknown-content-${stamp}`))).toBe(200);
    expect((await readState()).grants).toBe(0);
  });

  it('grants nothing for a content another host serves', async () => {
    // Both sides are configured, but not alike: crediting it would pay one
    // content's progress into another's grant.
    const other = await prisma.workshop_Instance.create({
      data: { slug: otherHostSlug, baseUrl: 'https://other.ctfd.invalid' },
    });
    expect(await post({ ...progress(4), instanceSlug: other.slug })).toBe(200);
    expect((await readState()).grants).toBe(0);
  });

  it('accepts a talent it knows nothing about, and grants nothing', async () => {
    // The sender is an outbox with a backoff, so a refusal it cannot act on
    // would simply be retried forever. It answers 200 and writes nothing.
    expect(
      await post({ ...progress(4), talentId: `sd_unknown_${stamp}` }),
    ).toBe(200);
    expect((await readState()).grants).toBe(0);
  });

  it('grants the first progress and leaves the XP owed a celebration', async () => {
    expect(await post(progress(5))).toBe(200);
    const { grant, participation, grants, owed } = await readState();
    expect(grants).toBe(1);
    // A third of a two-hour activity, rounded once over the whole thing.
    expect(grant?.amount).toBe(400);
    expect(participation?.solvedSteps).toBe(5);
    expect(participation?.totalSteps).toBe(TOTAL_STEPS);
    expect(owed).toBe(400);
  });

  it('changes nothing when the same progress is replayed', async () => {
    const before = await readState();
    expect(await post(progress(5))).toBe(200);
    const after = await readState();
    expect(after.grants).toBe(1);
    expect(after.grant?.amount).toBe(before.grant?.amount);
    expect(after.grant?.createdAt).toEqual(before.grant?.createdAt);
    // What is owed is what a replay must not inflate: a second float would
    // celebrate XP the ledger never paid.
    expect(after.owed).toBe(before.owed);
  });

  it('raises the one grant rather than adding a second', async () => {
    expect(await post(progress(15))).toBe(200);
    const { grant, participation, grants, owed } = await readState();
    expect(grants).toBe(1);
    // Finished whole: exactly the declared minutes, ten XP each.
    expect(grant?.amount).toBe(BUDGET_MINUTES * 10);
    expect(participation?.solvedSteps).toBe(15);
    // Nothing was celebrated in between, so the whole grant is owed, once.
    expect(owed).toBe(BUDGET_MINUTES * 10);
  });

  it('keeps the talent on the budget pinned at their first entry', async () => {
    // The admin re-declares the activity at three hours. The next callback still
    // pays the two hours this talent entered under, which is the whole of what
    // "changing a duration takes XP back off nobody" rests on.
    await prisma.eventConfig_Workshop.update({
      where: { eventId_activityId: { eventId, activityId } },
      data: { durationMinutes: 180 },
    });
    expect(await post(progress(15))).toBe(200);
    expect((await readState()).grant?.amount).toBe(BUDGET_MINUTES * 10);
  });

  it('files the next content on the same host apart, and leaves the first untouched', async () => {
    // The defect this key exists for: a host rotated to another content, and a
    // regular who walks it too. Keyed on the host, this progress replaced the
    // first content's XP; keyed on the content, it is a grant of its own.
    const before = await readState();
    await prisma.workshop_Participation.create({
      data: {
        talentId,
        activityId: nextActivityId,
        eventId,
        campusId,
        budgetMinutes: 60,
      },
    });
    expect(await post(progress(3, nextSlug))).toBe(200);

    const after = await readState();
    expect(after.grants).toBe(2);
    expect(after.grant?.amount).toBe(before.grant?.amount);
    expect(after.participation?.solvedSteps).toBe(
      before.participation?.solvedSteps,
    );
    const nextGrant = await prisma.xpGrant.findUnique({
      where: {
        source_sourceId: {
          source: 'workshop',
          sourceId: workshopGrantSourceId(nextSlug, talentId),
        },
      },
      select: { amount: true },
    });
    // Three of fifteen steps of an hour, on the next content's own budget.
    expect(nextGrant?.amount).toBe(120);

    // And each row of the history keeps its own name: renaming what the host
    // serves now does not rename what the talent walked before.
    await prisma.workshop_Activity.update({
      where: { id: nextActivityId },
      data: { label: 'Atelier suivant, renommé' },
    });
    const labels = await resolveGrantLabels(talentId, [
      { source: 'workshop', sourceId },
      {
        source: 'workshop',
        sourceId: workshopGrantSourceId(nextSlug, talentId),
      },
    ]);
    expect(labels.get(sourceId)).toBe('Atelier de test');
    expect(labels.get(workshopGrantSourceId(nextSlug, talentId))).toBe(
      'Atelier suivant, renommé',
    );
  });

  it('keeps an entered activity on its host, so another host cannot take its XP back', async () => {
    // The other host holds a fresh account for this talent, and its first
    // report would recount one step against a grant already earned.
    const before = await readState();
    await expect(
      writeWorkshopActivity({
        slug,
        instance: otherHostSlug,
        label: 'Atelier de test',
      }),
    ).rejects.toBeInstanceOf(OperationRefusedError);
    const activity = await prisma.workshop_Activity.findUniqueOrThrow({
      where: { slug },
      select: { instance: { select: { slug: true } } },
    });
    expect(activity.instance.slug).toBe(hostSlug);
    expect(await post({ ...progress(1), instanceSlug: otherHostSlug })).toBe(
      200,
    );
    expect((await readState()).grant?.amount).toBe(before.grant?.amount);

    // Before anybody has entered, the same call only corrects a declaration.
    const freshSlug = `test-workshop-fresh-${stamp}`;
    await prisma.workshop_Activity.create({
      data: { slug: freshSlug, instanceId, label: 'Atelier neuf' },
    });
    const moved = await writeWorkshopActivity({
      slug: freshSlug,
      instance: otherHostSlug,
      label: 'Atelier neuf',
    });
    expect(moved).toMatchObject({
      applied: true,
      after: { instance: otherHostSlug },
    });
  });
});
