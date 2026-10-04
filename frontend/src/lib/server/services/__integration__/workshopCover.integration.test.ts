import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isHttpError } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';

/**
 * An activity's cover, read back from its instance and copied into Jump.
 *
 * Driven through the WRITE an admin calls, against a fake instance on a real
 * socket, because what is under test is the whole exchange: what Jump asks for,
 * what it refuses to follow, what it stores, and that none of the ways the
 * instance can let it down ever fails the declaration itself.
 *
 * Storage and the image pipeline are the two things stubbed. Storage records
 * every key so a rotation and its cleanup are visible; the pipeline is `Bun.Image`,
 * which vitest's Node runner does not have, so it hands the bytes back as they
 * came, which keeps the content-addressed keys meaningful.
 */
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

vi.mock('$lib/server/images/process', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('$lib/server/images/process')>();
  return {
    ...actual,
    processImage: vi.fn(async (input: Uint8Array) => ({
      bytes: input,
      contentType: 'image/webp' as const,
      width: 320,
      height: 200,
    })),
  };
});

const { writeWorkshopInstance } =
  await import('$lib/server/adminApi/writes/workshops');
const { COVER_IMAGE_MAX_BYTES } = await import('$lib/server/workshops/cover');
const { GET: coverProxy } =
  await import('../../../../routes/api/workshops/covers/[instanceId]/[file]/+server');

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (seed: number) => new Uint8Array([...PNG_MAGIC, seed, seed, seed]);
/** A GIF whose header says 640 x 360. */
const gif = new Uint8Array([
  ...'GIF89a'.split('').map((c) => c.charCodeAt(0)),
  0x80,
  0x02,
  0x68,
  0x01,
  0,
  0,
]);

type Answer = {
  cover: { status: string; detail: string };
  after: { label: string; cover: { images: string[] } | null };
};

describe('the cover an instance hands back (integration)', () => {
  const stamp = Date.now();
  const slug = `test-cover-${stamp}`;

  let server: Server;
  let baseUrl = '';
  let instanceId = '';
  /** What the fake instance answers on `/jump/meta`: a status and a body. */
  let meta: { status: number; body: unknown };
  /** What it serves under `/files/...`. */
  let files: Map<string, { bytes: Uint8Array; length?: number }>;

  const fullCover = () => ({
    instance: slug,
    cover: {
      title: 'IA du fantôme de Pac-Man',
      summary: 'Programmez le fantôme.',
      tagline: 'Bientôt c’est TON code',
      media: '/files/ws-pacman/jeu-demo-aaaa.gif',
      poster: '/files/ws-pacman/jeu-aaaa.png',
      mascot: '/files/ws-pacman/fantome-aaaa.png',
    },
  });

  async function declare(
    overrides: { baseUrl?: string; enabled?: boolean; label?: string } = {},
  ): Promise<Answer> {
    const outcome = await writeWorkshopInstance({
      slug,
      label: overrides.label ?? 'Pacman IA',
      baseUrl: overrides.baseUrl ?? baseUrl,
      enabled: overrides.enabled ?? true,
    });
    if (!outcome.applied) throw new Error('the write did not apply');
    return outcome.answer as Answer;
  }

  const storedImages = () =>
    prisma.workshop_CoverImage.findMany({
      where: { instanceId },
      orderBy: { kind: 'asc' },
    });

  beforeAll(async () => {
    assertTestDatabase();
    server = createServer((req, res) => {
      if (req.url === '/jump/meta') {
        res.writeHead(meta.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(meta.body));
        return;
      }
      const file = files.get(req.url ?? '');
      if (!file) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        'content-length': String(file.length ?? file.bytes.byteLength),
      });
      res.end(file.length ? Buffer.alloc(0) : Buffer.from(file.bytes));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    meta = { status: 200, body: fullCover() };
    files = new Map([
      ['/files/ws-pacman/jeu-demo-aaaa.gif', { bytes: gif }],
      ['/files/ws-pacman/jeu-aaaa.png', { bytes: png(1) }],
      ['/files/ws-pacman/fantome-aaaa.png', { bytes: png(2) }],
    ]);
  });

  afterAll(async () => {
    await prisma.workshop_Instance.deleteMany({ where: { slug } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('copies the text and every picture on a first declaration', async () => {
    const answer = await declare();
    expect(answer.cover.status).toBe('fetched');

    const instance = await prisma.workshop_Instance.findUniqueOrThrow({
      where: { slug },
      select: { id: true, cover: true },
    });
    instanceId = instance.id;
    expect(instance.cover).toMatchObject({
      title: 'IA du fantôme de Pac-Man',
      tagline: 'Bientôt c’est TON code',
    });

    const images = await storedImages();
    expect(images.map((i) => i.kind)).toEqual(['media', 'poster', 'mascot']);
    for (const image of images) expect(objects.has(image.key)).toBe(true);

    // The animation is kept byte for byte, sized off its own header.
    const media = images.find((i) => i.kind === 'media')!;
    expect(media.contentType).toBe('image/gif');
    expect([media.width, media.height]).toEqual([640, 360]);
    expect(objects.get(media.key)).toEqual(gif);
    // A still goes through the pipeline.
    expect(images.find((i) => i.kind === 'poster')!.contentType).toBe(
      'image/webp',
    );
  });

  it('writes nothing when the answer is what is already stored', async () => {
    const before = await storedImages();
    const fetchedAt = (
      await prisma.workshop_Cover.findUniqueOrThrow({
        where: { instanceId },
      })
    ).fetchedAt;

    const answer = await declare();

    expect(answer.cover.status).toBe('unchanged');
    expect(await storedImages()).toEqual(before);
    const after = await prisma.workshop_Cover.findUniqueOrThrow({
      where: { instanceId },
    });
    expect(after.fetchedAt).toEqual(fetchedAt);
  });

  it('rotates a picture the subject replaced, and deletes the old copy', async () => {
    const oldPoster = (await storedImages()).find((i) => i.kind === 'poster')!;
    const body = fullCover();
    body.cover.poster = '/files/ws-pacman/jeu-bbbb.png';
    meta = { status: 200, body };
    files.set('/files/ws-pacman/jeu-bbbb.png', { bytes: png(3) });

    const answer = await declare();

    expect(answer.cover.status).toBe('fetched');
    const poster = (await storedImages()).find((i) => i.kind === 'poster')!;
    expect(poster.sourcePath).toBe('/files/ws-pacman/jeu-bbbb.png');
    expect(poster.key).not.toBe(oldPoster.key);
    expect(objects.has(poster.key)).toBe(true);
    expect(objects.has(oldPoster.key)).toBe(false);
  });

  it('drops a picture the subject no longer declares', async () => {
    const mascot = (await storedImages()).find((i) => i.kind === 'mascot')!;
    const body = fullCover();
    body.cover.poster = '/files/ws-pacman/jeu-bbbb.png';
    files.set('/files/ws-pacman/jeu-bbbb.png', { bytes: png(3) });
    (body.cover as { mascot: string | null }).mascot = null;
    meta = { status: 200, body };

    expect((await declare()).cover.status).toBe('fetched');
    expect((await storedImages()).map((i) => i.kind)).toEqual([
      'media',
      'poster',
    ]);
    expect(objects.has(mascot.key)).toBe(false);
  });

  describe('every failure keeps the stored cover and still lands the write', () => {
    let kept: Awaited<ReturnType<typeof storedImages>>;
    beforeEach(async () => {
      kept = await storedImages();
    });

    async function expectKept(status: string, answer: Answer) {
      expect(answer.cover.status).toBe(status);
      expect(answer.cover.detail.length).toBeGreaterThan(0);
      expect(await storedImages()).toEqual(kept);
    }

    it('an instance answering under another slug', async () => {
      meta = { status: 200, body: { ...fullCover(), instance: 'another-box' } };
      await expectKept('instance_mismatch', await declare());
    });

    it('an instance with nothing to present', async () => {
      meta = { status: 404, body: { error: 'nothing to present' } };
      await expectKept('no_cover', await declare());
    });

    it('an instance that does not answer, while the curation still lands', async () => {
      const answer = await declare({
        baseUrl: 'http://127.0.0.1:1',
        label: 'Pacman IA (relabelled)',
      });
      await expectKept('unreachable', answer);
      expect(answer.after.label).toBe('Pacman IA (relabelled)');
      await declare(); // Back to the fake instance for the cases below.
    });

    it('a picture that would leave the instance', async () => {
      const body = fullCover();
      body.cover.poster = '//evil.example/jeu.png';
      meta = { status: 200, body };
      await expectKept('invalid', await declare());
    });

    it('a picture that is not one', async () => {
      const body = fullCover();
      body.cover.poster = '/files/ws-pacman/page.png';
      meta = { status: 200, body };
      files.set('/files/ws-pacman/page.png', {
        bytes: new TextEncoder().encode('<!doctype html><p>hello'),
      });
      await expectKept('invalid', await declare());
    });

    it('a picture past the size a cover may weigh', async () => {
      const body = fullCover();
      body.cover.media = '/files/ws-pacman/huge.gif';
      meta = { status: 200, body };
      files.set('/files/ws-pacman/huge.gif', {
        bytes: gif,
        length: COVER_IMAGE_MAX_BYTES + 1,
      });
      await expectKept('invalid', await declare());
    });
  });

  it('does not ask a disabled instance anything', async () => {
    meta = { status: 500, body: null };
    const answer = await declare({ enabled: false });
    expect(answer.cover.status).toBe('not_read');
    expect(answer.after.cover).not.toBeNull();
  });

  describe('the proxy that serves the copies', () => {
    async function get(
      key: string,
      user: object | null = { id: 'u' },
    ): Promise<Response | number> {
      const [, id, file] = key.split('/');
      try {
        return await coverProxy({
          params: { instanceId: id, file },
          locals: { user },
        } as unknown as Parameters<typeof coverProxy>[0]);
      } catch (err) {
        if (isHttpError(err)) return err.status;
        throw err;
      }
    }

    it('serves a referenced picture, cached for good', async () => {
      const media = (await storedImages()).find((i) => i.kind === 'media')!;
      const response = await get(media.key);
      expect(response).toBeInstanceOf(Response);
      const ok = response as Response;
      expect(ok.headers.get('content-type')).toBe('image/gif');
      expect(ok.headers.get('cache-control')).toContain('immutable');
      expect(new Uint8Array(await ok.arrayBuffer())).toEqual(gif);
    });

    it('refuses a signed-out caller and a key no cover references', async () => {
      const media = (await storedImages()).find((i) => i.kind === 'media')!;
      expect(await get(media.key, null)).toBe(401);
      expect(await get(`workshops/${instanceId}/media-unknown.gif`)).toBe(404);
    });
  });
});
