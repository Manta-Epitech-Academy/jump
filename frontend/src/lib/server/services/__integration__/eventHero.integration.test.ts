/**
 * What one event says on its talents' home, written over `write_event_config`
 * (#501): each stage's words, the pictures of the stages before the event,
 * copied and served by Jump, and the event's own sign-up form.
 *
 * Exercised against a real database and a local picture host: the copy, the
 * keep-on-restate rule and the clean-up of bytes nobody points at are where a
 * picture write goes wrong, and none of them is visible to a unit test.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isHttpError } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { writeEventConfig } from '$lib/server/adminApi/writes/events';
import { OperationRefusedError } from '$lib/server/adminApi/errors';
import { GET as imageProxy } from '../../../../routes/api/event-hero/images/[eventId]/[file]/+server';

const objects = new Map<string, Uint8Array>();

vi.mock('$lib/server/infra/storage', () => ({
  getStorage: () => ({
    save: async (key: string, data: Uint8Array) => {
      objects.set(key, data);
      return key;
    },
    get: async (key: string) => {
      const data = objects.get(key);
      if (!data) throw new Error(`Object not found: ${key}`);
      return Buffer.from(data);
    },
    delete: async (key: string) => {
      objects.delete(key);
    },
    getDownloadUrl: async (key: string) => `https://example.invalid/${key}`,
  }),
  isObjectNotFound: () => false,
}));

// The address policy refuses loopback, which is where the test host lives, so
// it is let through here and judged on its own in `infra/publicAddress.test.ts`.
vi.mock('$lib/server/infra/publicAddress', () => ({
  isPublicAddress: vi.fn(() => true),
}));

vi.mock('$lib/server/images/process', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('$lib/server/images/process')>();
  return {
    ...actual,
    processImage: vi.fn(async (input: Uint8Array) => ({
      bytes: input,
      contentType: 'image/webp' as const,
      width: 1280,
      height: 720,
    })),
  };
});

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (seed: number) => new Uint8Array([...PNG_MAGIC, seed, seed, seed]);

describe('an event’s hero on the talent home (integration)', () => {
  const stamp = Date.now();
  let campusId = '';
  let eventId = '';
  let server: Server;
  let host = '';
  const files = new Map<string, Uint8Array>([
    ['/camp.png', png(1)],
    ['/inscrit.png', png(2)],
  ]);

  const words = {
    title: 'Viens au Halloween Camp',
    text: 'Quatre jours pour coder des fantômes.',
    buttonLabel: 'Je viens',
  };

  const storedImages = () =>
    prisma.eventConfig_HeroImage.findMany({
      where: { eventId },
      orderBy: { stage: 'asc' },
    });

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({
        data: { name: `HeroCampus-${stamp}`, timezone: 'Europe/Paris' },
      })
    ).id;
    eventId = (
      await prisma.event.create({
        data: {
          titre: `HeroEvent-${stamp}`,
          date: new Date(Date.now() + 20 * 86_400_000),
          campusId,
        },
      })
    ).id;
    server = createServer((req, res) => {
      const file = files.get(req.url ?? '');
      if (!file) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200).end(Buffer.from(file));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.event.deleteMany({ where: { campusId } });
    await prisma.campus.delete({ where: { id: campusId } });
  });

  it('copies a stage’s picture and serves it to a signed-in user only', async () => {
    const outcome = await writeEventConfig({
      eventId,
      hero: { invitation: { ...words, imageUrl: `${host}/camp.png` } },
    });
    expect(outcome.applied && outcome.after).toMatchObject({
      hero: {
        invitation: { ...words, imageUrl: `${host}/camp.png` },
        enrolled: null,
        live: null,
      },
    });

    const [image] = await storedImages();
    expect(image?.stage).toBe('invitation');
    expect(objects.has(image!.key)).toBe(true);

    const serve = async (user: object | null) => {
      try {
        return await imageProxy({
          params: { eventId, file: image!.key.split('/').pop()! },
          locals: { user },
        } as unknown as Parameters<typeof imageProxy>[0]);
      } catch (err) {
        if (isHttpError(err)) return err.status;
        throw err;
      }
    };
    const ok = (await serve({ id: 'u' })) as Response;
    expect(ok.headers.get('cache-control')).toContain('immutable');
    expect(await serve(null)).toBe(401);
  });

  // A stage the call leaves out keeps its words and its copy: writing the
  // enrolled stage must not cost the invitation its picture, nor download it
  // again from a host that may have stopped answering.
  it('keeps the stages a call leaves out, picture included', async () => {
    const before = await storedImages();
    files.delete('/camp.png');
    try {
      await writeEventConfig({
        eventId,
        hero: {
          enrolled: {
            title: null,
            text: 'On t’attend samedi.',
            buttonLabel: null,
            imageUrl: `${host}/inscrit.png`,
          },
          live: { title: null, text: 'Choisis ton sujet.', buttonLabel: null },
        },
      });
    } finally {
      files.set('/camp.png', png(1));
    }
    const after = await storedImages();
    expect(after.map((i) => i.stage)).toEqual(['invitation', 'enrolled']);
    expect(after[0]).toEqual(before[0]);
  });

  it('gives a stage back the mockup’s words on null, and deletes its picture', async () => {
    const enrolled = (await storedImages()).find(
      (i) => i.stage === 'enrolled',
    )!;
    await writeEventConfig({ eventId, hero: { enrolled: null } });

    expect(
      await prisma.eventConfig_Hero.findUnique({
        where: { eventId_stage: { eventId, stage: 'enrolled' } },
      }),
    ).toBeNull();
    expect(objects.has(enrolled.key)).toBe(false);
    expect((await storedImages()).map((i) => i.stage)).toEqual(['invitation']);
  });

  it('refuses a picture while the event runs, and a stage that says nothing', async () => {
    const live = await writeEventConfig({
      eventId,
      hero: {
        live: {
          title: 'Pendant',
          text: null,
          buttonLabel: null,
          imageUrl: `${host}/camp.png`,
        },
      },
    }).catch((err) => err);
    expect(live).toBeInstanceOf(OperationRefusedError);

    const empty = await writeEventConfig({
      eventId,
      hero: {
        enrolled: { title: null, text: null, buttonLabel: null },
      },
    }).catch((err) => err);
    expect(empty).toBeInstanceOf(OperationRefusedError);
    expect((empty as Error).message).toMatch(/passez-le à null/);
  });

  it('refuses a picture it cannot copy, and changes nothing', async () => {
    const before = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { publicName: true },
    });
    const refusal = await writeEventConfig({
      eventId,
      publicName: 'Ne doit pas rester',
      hero: { enrolled: { ...words, imageUrl: `${host}/absente.png` } },
    }).catch((err) => err);
    expect(refusal).toBeInstanceOf(OperationRefusedError);
    expect(
      await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
        select: { publicName: true },
      }),
    ).toEqual(before);
  });

  it('takes an https sign-up form and nothing else, and clears it on null', async () => {
    const refusal = await writeEventConfig({
      eventId,
      signupUrl: 'http://www.epitech.invalid/inscription',
    }).catch((err) => err);
    expect(refusal).toBeInstanceOf(OperationRefusedError);

    const set = await writeEventConfig({
      eventId,
      signupUrl: 'https://www.epitech.invalid/inscription/?CampaignId=camp',
    });
    expect(set.applied && set.after).toMatchObject({
      signupUrl: 'https://www.epitech.invalid/inscription/?CampaignId=camp',
    });
    const cleared = await writeEventConfig({ eventId, signupUrl: null });
    expect(cleared.applied && cleared.after).toMatchObject({ signupUrl: null });
  });
});
