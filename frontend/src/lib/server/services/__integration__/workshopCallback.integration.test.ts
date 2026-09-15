import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { isHttpError } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { workshopKeys } from '$lib/server/workshops/ticket';
import { workshopGrantSourceId } from '$lib/domain/workshops';
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
  const slug = `test-workshop-${stamp}`;
  const secret = process.env.WORKSHOP_TICKET_SECRET ?? '';
  const BUDGET_MINUTES = 120;
  const TOTAL_STEPS = 15;

  let campusId = '';
  let eventId = '';
  let instanceId = '';
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

  const progress = (solvedSteps: number) => ({
    instanceSlug: slug,
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
        where: { talentId_instanceId: { talentId, instanceId } },
        select: { solvedSteps: true, totalSteps: true, xpPending: true },
      }),
    ]);
    const grants = await prisma.xpGrant.count({
      where: { talentId, source: 'workshop' },
    });
    return { grant, participation, grants };
  };

  beforeAll(async () => {
    assertTestDatabase();
    expect(
      secret,
      'WORKSHOP_TICKET_SECRET must be set; copy frontend/.env.test.example',
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
      data: {
        slug,
        label: 'Atelier de test',
        baseUrl: 'https://test.ctfd.invalid',
      },
    });
    instanceId = instance.id;
    await prisma.eventConfig_Workshop.create({
      data: {
        eventId,
        instanceId,
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
        instanceId,
        eventId,
        campusId,
        budgetMinutes: BUDGET_MINUTES,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({ where: { id: talentId } });
      await prisma.eventConfig_Workshop.deleteMany({ where: { instanceId } });
      await prisma.workshop_Instance.deleteMany({ where: { id: instanceId } });
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
      await post({ instanceSlug: slug, talentId, solvedSteps: 'quatre' }),
    ).toBe(400);
    expect(await post({ ...progress(4), solvedSteps: -1 })).toBe(400);
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
    const { grant, participation, grants } = await readState();
    expect(grants).toBe(1);
    // A third of a two-hour activity, rounded once over the whole thing.
    expect(grant?.amount).toBe(400);
    expect(participation?.solvedSteps).toBe(5);
    expect(participation?.totalSteps).toBe(TOTAL_STEPS);
    expect(participation?.xpPending).toBe(400);
  });

  it('changes nothing when the same progress is replayed', async () => {
    const before = await readState();
    expect(await post(progress(5))).toBe(200);
    const after = await readState();
    expect(after.grants).toBe(1);
    expect(after.grant?.amount).toBe(before.grant?.amount);
    expect(after.grant?.createdAt).toEqual(before.grant?.createdAt);
    // The arrears are what a replay must not inflate: a second float would
    // celebrate XP the talent has already been shown.
    expect(after.participation?.xpPending).toBe(
      before.participation?.xpPending,
    );
  });

  it('raises the one grant rather than adding a second', async () => {
    expect(await post(progress(15))).toBe(200);
    const { grant, participation, grants } = await readState();
    expect(grants).toBe(1);
    // Finished whole: exactly the declared minutes, ten XP each.
    expect(grant?.amount).toBe(BUDGET_MINUTES * 10);
    expect(participation?.solvedSteps).toBe(15);
    // Only the difference is owed a celebration, on top of what was still owed.
    expect(participation?.xpPending).toBe(BUDGET_MINUTES * 10);
  });

  it('keeps the talent on the budget pinned at their first entry', async () => {
    // The admin re-declares the activity at three hours. The next callback still
    // pays the two hours this talent entered under, which is the whole of what
    // "changing a duration takes XP back off nobody" rests on.
    await prisma.eventConfig_Workshop.update({
      where: { eventId_instanceId: { eventId, instanceId } },
      data: { durationMinutes: 180 },
    });
    expect(await post(progress(15))).toBe(200);
    expect((await readState()).grant?.amount).toBe(BUDGET_MINUTES * 10);
  });
});
