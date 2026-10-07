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
 * How an activity presents itself, authored over the API and copied into Jump.
 *
 * Driven through the WRITE an admin calls, against a picture host on a real
 * socket, because what is under test is the whole exchange: what Jump
 * downloads, what it refuses to follow or to keep, what it stores, and that a
 * refused write leaves the cover exactly as it was.
 *
 * Storage, the image pipeline and the address policy are the three things
 * stubbed. Storage records every key so a rotation and its cleanup are
 * visible; the pipeline is `Bun.Image`, which vitest's Node runner does not
 * have, so it hands the bytes back as they came (so a stored copy can be
 * compared with what the host served) at a size each test can set. The address
 * policy refuses loopback, which is where the test host lives, so it is let
 * through here and judged on its own in `infra/publicAddress.test.ts`; one test
 * turns it back on to see a refusal reach the admin.
 */
const objects = new Map<string, Uint8Array>();
/** The size the stubbed pipeline reports for a still. */
let stillSize = { width: 800, height: 450 };

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
      ...stillSize,
    })),
  };
});

const { writeWorkshopCover, writeWorkshopInstance } =
  await import('$lib/server/adminApi/writes/workshops');
const { ADMIN_API_OPERATIONS } =
  await import('$lib/server/adminApi/operations');
const { OperationRefusedError } = await import('$lib/server/adminApi/errors');
const { REMOTE_IMAGE_MAX_BYTES } = await import('$lib/server/images/remote');
const { isPublicAddress } = await import('$lib/server/infra/publicAddress');
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

describe('the cover an admin gives an activity (integration)', () => {
  const stamp = Date.now();
  const slug = `test-cover-${stamp}`;

  let server: Server;
  let host = '';
  let instanceId = '';
  /**
   * What the host serves, by path: bytes, a fake length, a body streamed with
   * no length at all, or a redirect.
   */
  let files: Map<
    string,
    | { bytes: Uint8Array; length?: number }
    | { stream: number }
    | { redirect: string }
  >;

  const at = (path: string) => `${host}${path}`;
  const fullCover = () => ({
    slug,
    tagline: 'Bientôt c’est TON code',
    mediaUrl: at('/jeu-demo.gif'),
    posterUrl: at('/jeu.png'),
    mascotUrl: at('/fantome.png'),
  });

  async function write(params: Parameters<typeof writeWorkshopCover>[0]) {
    const outcome = await writeWorkshopCover(params);
    if (!outcome.applied) throw new Error('the write did not apply');
    return outcome;
  }

  const storedImages = () =>
    prisma.workshop_CoverImage.findMany({
      where: { instanceId },
      orderBy: { kind: 'asc' },
    });

  /**
   * The bucket holds exactly what the rows name for this activity: nothing a
   * row points at is missing, and nothing is left that no row points at.
   */
  async function expectStorageMatchesRows() {
    const named = (await storedImages()).map((image) => image.key).sort();
    const held = [...objects.keys()]
      .filter((key) => key.startsWith(`workshops/${instanceId}/`))
      .sort();
    expect(held).toEqual(named);
  }

  beforeAll(async () => {
    assertTestDatabase();
    server = createServer((req, res) => {
      const file = files.get(req.url ?? '');
      if (!file) {
        res.writeHead(404).end();
        return;
      }
      if ('redirect' in file) {
        res.writeHead(302, { location: file.redirect }).end();
        return;
      }
      if ('stream' in file) {
        // Chunked, so nothing announces the size before the bytes arrive.
        res.writeHead(200);
        const chunk = Buffer.alloc(64 * 1024, 0x89);
        let left = file.stream;
        const pump = () => {
          while (left > 0) {
            left -= chunk.byteLength;
            if (!res.write(chunk)) return void res.once('drain', pump);
          }
          res.end();
        };
        res.on('close', () => (left = 0));
        pump();
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
    host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await writeWorkshopInstance({
      slug,
      label: 'Pacman IA',
      baseUrl: 'https://pacman.example.invalid',
    });
    instanceId = (
      await prisma.workshop_Instance.findUniqueOrThrow({ where: { slug } })
    ).id;
  });

  beforeEach(() => {
    stillSize = { width: 800, height: 450 };
    files = new Map([
      ['/jeu-demo.gif', { bytes: gif }],
      ['/jeu.png', { bytes: png(1) }],
      ['/fantome.png', { bytes: png(2) }],
    ]);
  });

  afterAll(async () => {
    await prisma.workshop_Instance.deleteMany({ where: { slug } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('copies the tagline and every picture', async () => {
    const outcome = await write(fullCover());

    expect(outcome.after).toMatchObject({
      tagline: 'Bientôt c’est TON code',
      images: [
        { kind: 'media', sourceUrl: at('/jeu-demo.gif') },
        { kind: 'poster', sourceUrl: at('/jeu.png') },
        { kind: 'mascot', sourceUrl: at('/fantome.png') },
      ],
    });
    const images = await storedImages();
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

  it('leaves the same cover when the same call is written again, and no copy behind', async () => {
    const outcome = await write(fullCover());

    expect(outcome.after).toEqual(outcome.before);
    await expectStorageMatchesRows();
  });

  it('picks up a picture replaced at the same address, and deletes the old copy', async () => {
    const oldPoster = (await storedImages()).find((i) => i.kind === 'poster')!;
    files.set('/jeu.png', { bytes: png(3) });

    await write(fullCover());

    const poster = (await storedImages()).find((i) => i.kind === 'poster')!;
    expect(objects.get(poster.key)).toEqual(png(3));
    expect(objects.has(oldPoster.key)).toBe(false);
    await expectStorageMatchesRows();
  });

  // Two admins, or a model retrying on a timeout while its first call is still
  // in flight. The other writer is played by hand so that the overlap is the
  // one that matters, every time: it holds the activity while this write
  // reaches its transaction, then commits a cover of its own and clears what
  // it replaced, exactly as a write does. This write must then replace the
  // OTHER writer's pictures, not the ones it saw before waiting, or theirs are
  // left in the bucket with no row naming them.
  it('replaces what a concurrent write committed while it waited', async () => {
    const otherKeys: string[] = [];
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let holder = '';
    let held!: () => void;
    const holding = new Promise<void>((resolve) => (held = resolve));

    const other = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "Workshop_Instance" WHERE id = ${instanceId} FOR UPDATE`;
        const [{ xid }] = await tx.$queryRaw<
          { xid: string }[]
        >`SELECT pg_current_xact_id()::text AS xid`;
        holder = xid;
        held();
        await released;

        const replaced = await tx.workshop_CoverImage.findMany({
          where: { instanceId },
        });
        await tx.workshop_CoverImage.deleteMany({ where: { instanceId } });
        for (const image of replaced) {
          const key = `workshops/${instanceId}/${image.kind}-other.webp`;
          objects.set(key, png(9));
          otherKeys.push(key);
          await tx.workshop_CoverImage.create({ data: { ...image, key } });
        }
        return replaced.map((image) => image.key);
      },
      { timeout: 15_000 },
    );

    await holding;
    const writing = write(fullCover());
    // Released only once this write is queued behind the other one.
    for (;;) {
      const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::int AS waiting FROM pg_locks
        WHERE NOT granted AND locktype = 'transactionid'
          AND transactionid::text = ${holder}`;
      if (waiting > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    release();
    for (const key of await other) objects.delete(key);
    await writing;

    for (const key of otherKeys) expect(objects.has(key)).toBe(false);
    await expectStorageMatchesRows();
  });

  it('removes what the call leaves out', async () => {
    const mascot = (await storedImages()).find((i) => i.kind === 'mascot')!;

    const { mascotUrl: _mascot, tagline: _tagline, ...rest } = fullCover();
    const outcome = await write(rest);

    expect(outcome.after).toMatchObject({ tagline: null });
    expect((await storedImages()).map((i) => i.kind)).toEqual([
      'media',
      'poster',
    ]);
    expect(objects.has(mascot.key)).toBe(false);
    await expectStorageMatchesRows();
  });

  describe('a picture that cannot be copied refuses the whole write', () => {
    async function expectRefused(
      params: Parameters<typeof writeWorkshopCover>[0],
      saying: RegExp,
    ) {
      const before = await storedImages();
      const tagline = (
        await prisma.workshop_Instance.findUniqueOrThrow({ where: { slug } })
      ).tagline;
      const keys = [...objects.keys()];

      const refusal = await writeWorkshopCover(params).catch((err) => err);

      expect(refusal).toBeInstanceOf(OperationRefusedError);
      expect((refusal as Error).message).toMatch(saying);
      expect(await storedImages()).toEqual(before);
      expect(
        (await prisma.workshop_Instance.findUniqueOrThrow({ where: { slug } }))
          .tagline,
      ).toBe(tagline);
      expect([...objects.keys()]).toEqual(keys);
    }

    it('an unreachable host', async () => {
      await expectRefused(
        { ...fullCover(), mascotUrl: 'http://127.0.0.1:1/fantome.png' },
        /La mascotte .* n'a pas pu être téléchargée/,
      );
    });

    it('a redirect, which is never followed', async () => {
      files.set('/ailleurs.png', { redirect: at('/fantome.png') });
      await expectRefused(
        { ...fullCover(), mascotUrl: at('/ailleurs.png') },
        /redirige ailleurs/,
      );
    });

    it('bytes that are not a picture', async () => {
      files.set('/page.png', { bytes: new TextEncoder().encode('<html>') });
      await expectRefused(
        { ...fullCover(), posterUrl: at('/page.png') },
        /ni un GIF, ni un PNG/,
      );
    });

    it('a picture over 6 MB', async () => {
      files.set('/huge.gif', {
        bytes: gif,
        length: REMOTE_IMAGE_MAX_BYTES + 1,
      });
      await expectRefused(
        { ...fullCover(), mediaUrl: at('/huge.gif') },
        /dépasse 6 Mo/,
      );
    });

    it('a picture over 6 MB that never said how large it was', async () => {
      files.set('/flux.png', { stream: REMOTE_IMAGE_MAX_BYTES * 4 });
      await expectRefused(
        { ...fullCover(), posterUrl: at('/flux.png') },
        /dépasse 6 Mo/,
      );
    });

    it('an address that is not public, written as an IP or as a name', async () => {
      vi.mocked(isPublicAddress).mockReturnValue(false);
      try {
        // An IP is judged before the request, a name by the lookup the
        // request connects through: every address is a name here, so the
        // refusal can only have come from the second.
        await expectRefused(fullCover(), /adresse interne/);
        const byName = Object.fromEntries(
          Object.entries(fullCover()).map(([field, value]) => [
            field,
            field.endsWith('Url')
              ? value.replace('127.0.0.1', 'localhost')
              : value,
          ]),
        ) as ReturnType<typeof fullCover>;
        await expectRefused(byName, /adresse interne/);
      } finally {
        vi.mocked(isPublicAddress).mockReturnValue(true);
      }
    });

    it('a still too narrow for the hero, or not landscape', async () => {
      stillSize = { width: 320, height: 200 };
      await expectRefused(fullCover(), /il en faut au moins 480/);
      stillSize = { width: 600, height: 800 };
      await expectRefused(fullCover(), /image horizontale/);
    });

    it('an animated still', async () => {
      await expectRefused(
        { ...fullCover(), posterUrl: at('/jeu-demo.gif') },
        /est un GIF/,
      );
    });

    it('an animation with no still for reduced motion', async () => {
      const { posterUrl: _poster, ...rest } = fullCover();
      await expectRefused(rest, /besoin d'une image fixe/);
    });

    it('an activity that does not exist', async () => {
      await expectRefused(
        { ...fullCover(), slug: `${slug}-absent` },
        /introuvable/,
      );
    });
  });

  it('takes nothing but an https address, at the operation boundary', () => {
    const { schema } = ADMIN_API_OPERATIONS.write_workshop_cover;
    expect(
      schema.safeParse({ slug, mediaUrl: 'https://cdn.example.invalid/a.png' })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({ slug, mediaUrl: 'http://cdn.example.invalid/a.png' })
        .success,
    ).toBe(false);
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
