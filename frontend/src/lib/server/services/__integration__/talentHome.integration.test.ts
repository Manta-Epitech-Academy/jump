/**
 * What a campus puts on its talents' home, from the write that sets it to the
 * home that shows it.
 *
 * The writes go through the wrapper, as in `adminApiWrites.integration.test.ts`,
 * so the refusals are the ones a caller actually receives and the audit row is
 * the one that makes « remettre l'ancien texte » possible. The highlight's
 * picture is the exception: the wrapper takes https only, so the copy is driven
 * through the write itself against a picture host on a local socket, with
 * storage and the image pipeline stubbed as in `workshopCover.integration.test.ts`.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isHttpError } from '@sveltejs/kit';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import { mintToken } from '$lib/server/adminApi/tokens';
import { adminApiRead, adminApiWrite } from '$lib/server/adminApi/route';
import { writeTalentHomeHighlight } from '$lib/server/adminApi/writes/talentHome';
import { getTalentHome } from '$lib/server/services/talentHomeService';
import { toDateKey } from '$lib/domain/planningTime';
import { OperationRefusedError } from '$lib/server/adminApi/errors';
import { GET as imageProxy } from '../../../../routes/api/talent-home/images/[campusId]/[file]/+server';

const objects = new Map<string, Uint8Array>();
/** The size the stubbed pipeline reports for a picture. */
let pictureSize = { width: 1280, height: 720 };

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
      ...pictureSize,
    })),
  };
});

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (seed: number) => new Uint8Array([...PNG_MAGIC, seed, seed, seed]);
const gif = new Uint8Array([
  ...'GIF89a'.split('').map((c) => c.charCodeAt(0)),
  0x80,
  0x02,
  0x68,
  0x01,
  0,
  0,
]);

const postNote = adminApiWrite('write_talent_home_note');
const postHighlight = adminApiWrite('write_talent_home_highlight');
const getContent = adminApiRead('config_talent_home');

async function post(
  handler: RequestHandler,
  secret: string,
  body: unknown,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const request = new Request('http://localhost/api/admin/write/talent-home', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  const response = await handler({
    request,
    url: new URL(request.url),
    locals: {} as App.Locals,
  } as RequestEvent);
  return { status: response.status, payload: await response.json() };
}

async function read(
  secret: string,
  query: string,
): Promise<Record<string, unknown>> {
  const request = new Request(
    `http://localhost/api/admin/config/talent-home?${query}`,
    { headers: { authorization: `Bearer ${secret}` } },
  );
  const response = await getContent({
    request,
    url: new URL(request.url),
    locals: {} as App.Locals,
  } as RequestEvent);
  return response.json();
}

/** The day `offset` days from today, as the API takes it. */
const dayFromToday = (offset: number) =>
  toDateKey(new Date(Date.now() + offset * 86_400_000), 'Europe/Paris');

describe('the campus content on a talent’s home (integration)', () => {
  const stamp = Date.now();
  const campusName = `HomeCampus-${stamp}`;
  let adminUserId = '';
  let secret = '';
  let campusId = '';

  const highlight = {
    campus: campusName,
    title: 'Recode le jeu Snake en JS',
    summary: 'Deux heures pour coder ton propre Snake.',
    date: dayFromToday(10),
    url: 'https://www.epitech.invalid/inscription-atelier-programmation-informatique/?CampaignId=701Sm00000xAuQMIA0',
  };

  beforeAll(async () => {
    assertTestDatabase();
    const admin = await createAdminAccount(`home.admin.${stamp}@epitech.eu`);
    adminUserId = admin.id;
    secret = (
      await mintToken(adminUserId, { label: 'Écriture', writeEnabled: true })
    ).secret;
    campusId = (
      await prisma.campus.create({
        data: { name: campusName, timezone: 'Europe/Paris' },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      await prisma.adminApi_Call.deleteMany({
        where: { actorUserId: adminUserId },
      });
      await prisma.campus.deleteMany({ where: { id: campusId } });
      await prisma.bauth_user.delete({ where: { id: adminUserId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('sets the note, and repeating it changes nothing', async () => {
    const body = {
      campus: campusName,
      markdown:
        '## Bonne rentrée\n\nRejoins [le Discord](https://discord.gg/x).',
    };
    const first = await post(postNote, secret, body);
    expect(first.status).toBe(200);
    expect(first.payload.before).toBeNull();
    expect(first.payload.after).toEqual({
      campus: campusName,
      markdown: body.markdown,
    });

    const again = await post(postNote, secret, body);
    expect(again.payload.before).toEqual(again.payload.after);

    const audit = await prisma.adminApi_Call.findFirst({
      where: { actorUserId: adminUserId, operation: 'write_talent_home_note' },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit?.after).toMatchObject({ markdown: body.markdown });
  });

  it('refuses a note carrying an image or HTML, and keeps the previous one', async () => {
    for (const markdown of [
      '![affiche](https://tracker.example/a.png)',
      '<script>alert(1)</script>',
    ]) {
      const { status } = await post(postNote, secret, {
        campus: campusName,
        markdown,
      });
      expect(status).toBe(400);
    }
    expect(
      (await prisma.talentHome_Note.findUnique({ where: { campusId } }))
        ?.markdown,
    ).toContain('Bonne rentrée');
  });

  it('refuses an unknown campus by naming the ones that exist', async () => {
    const { status, payload } = await post(postNote, secret, {
      campus: 'Atlantide',
      markdown: 'Salut',
    });
    expect(status).toBe(400);
    expect(String(payload.error)).toContain(campusName);
  });

  it('sets the highlight, and refuses an http link, a past day or a half-filled one', async () => {
    const set = await post(postHighlight, secret, highlight);
    expect(set.status).toBe(200);
    expect(set.payload.after).toEqual({ ...highlight, imageUrl: null });

    for (const body of [
      { ...highlight, url: 'http://www.epitech.invalid/form' },
      { ...highlight, date: dayFromToday(-1) },
      { ...highlight, url: null },
      { ...highlight, summary: 'x'.repeat(301) },
      { ...highlight, imageUrl: 'http://www.epitech.invalid/affiche.png' },
    ]) {
      const { status } = await post(postHighlight, secret, body);
      expect(status).toBe(400);
    }
  });

  it('shows the rendered note and the open highlight on the campus home', async () => {
    const home = await getTalentHome(campusId);
    expect(home.note).toContain('<h2>Bonne rentrée</h2>');
    expect(home.note).toContain('rel="noopener noreferrer"');
    expect(home.highlight).toEqual({
      title: highlight.title,
      summary: highlight.summary,
      date: highlight.date,
      url: highlight.url,
      image: null,
    });
  });

  it('stops showing the highlight once its day has passed', async () => {
    const afterTheDay = new Date(Date.now() + 12 * 86_400_000);
    expect((await getTalentHome(campusId, afterTheDay)).highlight).toBeNull();

    // Still before its day by the real clock, so the admin read says shown.
    const payload = await read(
      secret,
      `campus=${encodeURIComponent(campusName)}`,
    );
    const [row] = (payload.campuses as { value: { highlight: unknown }[] })
      .value;
    expect(row?.highlight).toMatchObject({ shown: true });
  });

  it('refuses a day already past on the campus clock', async () => {
    const tomorrowMorning = new Date(
      new Date(`${highlight.date}T00:00:00Z`).getTime() + 86_400_000,
    );
    await expect(
      writeTalentHomeHighlight(highlight, tomorrowMorning),
    ).rejects.toThrow(/déjà passé/);
  });

  it('clears both blocks with nulls', async () => {
    await post(postNote, secret, { campus: campusName, markdown: null });
    const cleared = await post(postHighlight, secret, {
      campus: campusName,
      title: null,
      summary: null,
      date: null,
      url: null,
    });
    expect(cleared.status).toBe(200);
    expect(cleared.payload.after).toBeNull();
    expect(await getTalentHome(campusId)).toEqual({
      note: null,
      highlight: null,
    });
  });

  describe('the highlight’s picture', () => {
    let server: Server;
    let host = '';
    const files = new Map<string, Uint8Array>([
      ['/snake.png', png(1)],
      ['/snake.gif', gif],
    ]);

    beforeAll(async () => {
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
    });

    const storedImage = () =>
      prisma.talentHome_HighlightImage.findUnique({ where: { campusId } });

    it('copies it, shows it on the home, and serves it to a signed-in user only', async () => {
      pictureSize = { width: 1280, height: 720 };
      const outcome = await writeTalentHomeHighlight({
        ...highlight,
        imageUrl: `${host}/snake.png`,
      });
      expect(outcome.applied && outcome.after).toMatchObject({
        imageUrl: `${host}/snake.png`,
      });

      const image = (await storedImage())!;
      expect(objects.has(image.key)).toBe(true);
      expect((await getTalentHome(campusId)).highlight?.image).toEqual({
        url: `/api/talent-home/images/${campusId}/${image.key.split('/').pop()}`,
        width: 1280,
        height: 720,
      });

      const serve = async (user: object | null) => {
        try {
          return await imageProxy({
            params: { campusId, file: image.key.split('/').pop()! },
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

    it('refuses a GIF, a small or portrait picture, and keeps the one it had', async () => {
      const before = await storedImage();
      const attempts: [string, { width: number; height: number }, RegExp][] = [
        ['/snake.gif', { width: 1280, height: 720 }, /est un GIF/],
        ['/snake.png', { width: 320, height: 200 }, /au moins 480/],
        ['/snake.png', { width: 600, height: 900 }, /image horizontale/],
      ];
      for (const [path, size, saying] of attempts) {
        pictureSize = size;
        const refusal = await writeTalentHomeHighlight({
          ...highlight,
          imageUrl: `${host}${path}`,
        }).catch((err) => err);
        expect(refusal).toBeInstanceOf(OperationRefusedError);
        expect((refusal as Error).message).toMatch(saying);
      }
      expect(await storedImage()).toEqual(before);
      expect(objects.has(before!.key)).toBe(true);
    });

    it('drops the picture and its bytes when a write leaves it out', async () => {
      const before = (await storedImage())!;
      await writeTalentHomeHighlight(highlight);
      expect(await storedImage()).toBeNull();
      expect(objects.has(before.key)).toBe(false);
    });

    it('drops the picture and its bytes with the highlight', async () => {
      pictureSize = { width: 1280, height: 720 };
      files.set('/other.png', png(2));
      await writeTalentHomeHighlight({
        ...highlight,
        imageUrl: `${host}/other.png`,
      });
      const image = (await storedImage())!;

      await writeTalentHomeHighlight({
        campus: campusName,
        title: null,
        summary: null,
        date: null,
        url: null,
      });
      expect(await storedImage()).toBeNull();
      expect(objects.has(image.key)).toBe(false);
    });
  });

  it('gives a talent with no campus nothing', async () => {
    expect(await getTalentHome(null)).toEqual({ note: null, highlight: null });
  });
});
