import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { isHttpError } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { workshopKeys } from '$lib/server/workshops/ticket';
import {
  AnonymizationService,
  anonymizeTalent,
} from '$lib/server/services/anonymizationService';
import { WORKSHOP_ERASURE_BATCH_MAX } from '$lib/server/services/workshopService';
import { POST } from '../../../../routes/api/workshops/erasures/+server';
import { assertTestDatabase } from './testDatabase';

/**
 * A CTFd instance asking which of its accounts belong to erased talents, driven
 * through the ROUTE, and the erasure fact that answers it.
 *
 * The instance deletes every id it gets back, so the two properties under test
 * are the ones a deletion rests on: nobody unsigned gets an answer, and an id
 * comes back only on proof that Jump erased that talent. An id Jump has never
 * heard of is the case that matters most, because "unknown" read as "erased"
 * would let a re-seeded development Jump wipe an instance's accounts.
 */
describe('the workshop erasure question (integration)', () => {
  const stamp = Date.now();
  const secret = process.env.WORKSHOP_TICKET_SECRET ?? '';
  let keptId = '';
  let erasedId = '';

  function sign(rawBody: string, ts: number): string {
    const { callbackKey } = workshopKeys(secret);
    return (
      'sha256=' +
      createHmac('sha256', callbackKey).update(`${ts}.${rawBody}`).digest('hex')
    );
  }

  async function ask(
    body: unknown,
    overrides: { ts?: number; signature?: string } = {},
  ): Promise<{ status: number; erased?: string[] }> {
    const rawBody = JSON.stringify(body);
    const ts = overrides.ts ?? Math.floor(Date.now() / 1000);
    const request = new Request('http://localhost/api/workshops/erasures', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-timestamp': String(ts),
        'x-signature': overrides.signature ?? sign(rawBody, ts),
      },
      body: rawBody,
    });
    try {
      const response = await POST({
        request,
      } as unknown as Parameters<typeof POST>[0]);
      const answer = (await response.json()) as { erased: string[] };
      return { status: response.status, erased: answer.erased };
    } catch (err) {
      if (isHttpError(err)) return { status: err.status };
      throw err;
    }
  }

  beforeAll(async () => {
    assertTestDatabase();
    expect(
      secret,
      'WORKSHOP_TICKET_SECRET must be set: it is declared in frontend/.env.test.defaults, which `bun run test:integration` sources',
    ).not.toBe('');

    const [kept, erased] = await Promise.all([
      prisma.talent.create({
        data: { prenom: 'Camille', nom: `Kept${stamp}` },
      }),
      prisma.talent.create({ data: { prenom: 'Lou', nom: `Erased${stamp}` } }),
    ]);
    keptId = kept.id;
    erasedId = erased.id;
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({
        where: { id: { in: [keptId, erasedId] } },
      });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('stamps the erasure once, and a second run does not move it', async () => {
    await prisma.$transaction((tx) => anonymizeTalent(tx, erasedId));
    const first = await prisma.talent.findUniqueOrThrow({
      where: { id: erasedId },
      select: { anonymizedAt: true },
    });
    expect(first.anonymizedAt).not.toBeNull();

    await prisma.$transaction((tx) => anonymizeTalent(tx, erasedId));
    const second = await prisma.talent.findUniqueOrThrow({
      where: { id: erasedId },
      select: { anonymizedAt: true },
    });
    expect(second.anonymizedAt).toEqual(first.anonymizedAt);
  });

  it('refuses a question whose signature does not match', async () => {
    const answer = await ask(
      { talentIds: [erasedId] },
      { signature: 'sha256=deadbeef' },
    );
    expect(answer).toEqual({ status: 401 });
  });

  it('refuses a correctly signed question whose timestamp is stale', async () => {
    const stale = Math.floor(Date.now() / 1000) - 600;
    expect((await ask({ talentIds: [erasedId] }, { ts: stale })).status).toBe(
      401,
    );
  });

  it('refuses a question of the wrong shape or over the batch size', async () => {
    expect((await ask({ talentIds: erasedId })).status).toBe(400);
    expect((await ask({ talentIds: [''] })).status).toBe(400);
    const tooMany = Array.from(
      { length: WORKSHOP_ERASURE_BATCH_MAX + 1 },
      (_, i) => `sd_unknown_${i}`,
    );
    expect((await ask({ talentIds: tooMany })).status).toBe(400);
  });

  it('names the erased talent only, and holds an id it does not know', async () => {
    const answer = await ask({
      talentIds: [keptId, erasedId, `sd_unknown_${stamp}`],
    });
    expect(answer).toEqual({ status: 200, erased: [erasedId] });
  });
});

/**
 * The other place Jump erases from. What a CTFd instance is told rests on
 * `anonymizedAt`, so the sweep has to stamp what it erases, and it decides what
 * is left to erase by that same stamp.
 */
describe('the inactivity sweep (integration)', () => {
  const stamp = Date.now();
  const longAgo = new Date(Date.now() - 3 * 365 * 24 * 3600 * 1000);
  let inactiveId = '';
  let erasedId = '';

  beforeAll(async () => {
    assertTestDatabase();
    const [inactive, erased] = await Promise.all([
      prisma.talent.create({
        data: {
          prenom: 'Sacha',
          nom: `Inactive${stamp}`,
          lastActiveAt: longAgo,
        },
      }),
      prisma.talent.create({
        data: { prenom: 'Noa', nom: `Erased${stamp}`, lastActiveAt: longAgo },
      }),
    ]);
    inactiveId = inactive.id;
    erasedId = erased.id;
    await prisma.$transaction((tx) => anonymizeTalent(tx, erasedId));
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({
        where: { id: { in: [inactiveId, erasedId] } },
      });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('erases and stamps an inactive talent, and leaves an erased one alone', async () => {
    const erasedBefore = await prisma.talent.findUniqueOrThrow({
      where: { id: erasedId },
      select: { updatedAt: true },
    });

    await AnonymizationService.anonymizeInactiveStudents();

    const [inactive, erased] = await Promise.all([
      prisma.talent.findUniqueOrThrow({
        where: { id: inactiveId },
        select: { prenom: true, anonymizedAt: true },
      }),
      prisma.talent.findUniqueOrThrow({
        where: { id: erasedId },
        select: { updatedAt: true },
      }),
    ]);
    expect(inactive.prenom).toBe('Anonymisé');
    expect(inactive.anonymizedAt).not.toBeNull();
    // Not run a second time: a re-run would rewrite the row and move it.
    expect(erased.updatedAt).toEqual(erasedBefore.updatedAt);
  });
});
