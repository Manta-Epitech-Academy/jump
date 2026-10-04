/**
 * An activity's cover, read back from its CTFd instance and copied into Jump.
 *
 * The headline and the pictures a talent's dashboard leads with are authored
 * once, in the subject repo's `cover` block, and synced onto the instance by the
 * plugin. The instance hands them back on `GET <baseUrl>/jump/meta`, and this
 * file takes a copy: the text into `Workshop_Cover`, every picture into storage.
 *
 * Copied, never linked to. A minor's browser fetches nothing from another host
 * (DESIGN.md, avatars), a re-sync renames the instance's files so a link would
 * break, and the dashboard must not depend on CTFd on a day it runs no event.
 *
 * Run when an admin declares or re-declares an instance, never on a page load,
 * so a slow or absent instance costs one admin answer and no talent anything.
 * Every way it can fail leaves the stored copy as it was and says why: a stale
 * cover is a better dashboard than none.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '$lib/server/db';
import { getStorage } from '$lib/server/infra/storage';
import {
  processImage,
  readGifSize,
  sniffImageType,
} from '$lib/server/images/process';
import {
  workshopCoverKey,
  type WorkshopCoverKind,
} from '$lib/domain/workshops';

export type CoverRefreshStatus =
  /** The answer changed what is stored, and the copy now matches it. */
  | 'fetched'
  /** The answer is what is already stored. Nothing was written. */
  | 'unchanged'
  /** The instance has no cover to give (no subject synced on it yet). */
  | 'no_cover'
  /** No usable answer: refused, timed out, or not this plugin version. */
  | 'unreachable'
  /** The instance answered under another slug: the address names another box. */
  | 'instance_mismatch'
  /** The instance answered, but something in the answer cannot be stored. */
  | 'invalid';

export type CoverRefresh = {
  status: CoverRefreshStatus;
  /** One French sentence for the admin, relayed by their MCP client. */
  detail: string;
};

const KINDS: WorkshopCoverKind[] = ['media', 'poster', 'mascot'];

const META_PATH = '/jump/meta';
const META_TIMEOUT_MS = 5_000;
const IMAGE_TIMEOUT_MS = 15_000;
/**
 * A cover is shown to every talent of an event on the day, on phones, often on
 * mobile data: past this it is not a cover any more, it is a video.
 */
export const COVER_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
/** Longest stored edge per picture. The mascot is drawn small. */
const MAX_EDGE: Record<WorkshopCoverKind, number> = {
  media: 1280,
  poster: 1280,
  mascot: 512,
};
const WEBP_QUALITY = 80;

/**
 * A path on the instance itself. Root-relative and nothing else: no scheme, no
 * `//host`, so resolving it against `baseUrl` cannot leave that origin, which is
 * the one host an admin chose for Jump to call.
 */
const instancePath = z
  .string()
  .regex(/^\/(?![/\\])[^\s?#]*$/)
  .nullable();

const metaAnswer = z.object({
  instance: z.string(),
  cover: z.object({
    title: z.string().trim().min(1),
    summary: z.string().nullable(),
    tagline: z.string().nullable(),
    media: instancePath,
    poster: instancePath,
    mascot: instancePath,
  }),
});

type StoredImage = {
  kind: WorkshopCoverKind;
  sourcePath: string;
  key: string;
  contentType: string;
  width: number;
  height: number;
};

class CoverRefusal extends Error {
  constructor(
    readonly status: CoverRefreshStatus,
    detail: string,
  ) {
    super(detail);
  }
}

export async function refreshWorkshopCover(instance: {
  id: string;
  slug: string;
  baseUrl: string;
}): Promise<CoverRefresh> {
  try {
    return await refresh(instance);
  } catch (err) {
    if (err instanceof CoverRefusal)
      return { status: err.status, detail: err.message };
    throw err;
  }
}

async function refresh(instance: {
  id: string;
  slug: string;
  baseUrl: string;
}): Promise<CoverRefresh> {
  const meta = await readMeta(instance.baseUrl);
  if (meta.instance !== instance.slug) {
    throw new CoverRefusal(
      'instance_mismatch',
      `L'instance à cette adresse se présente comme « ${meta.instance} », pas comme « ${instance.slug} » : l'adresse désigne probablement une autre instance. L'aperçu enregistré est conservé.`,
    );
  }

  const stored = await prisma.workshop_Cover.findUnique({
    where: { instanceId: instance.id },
    select: {
      title: true,
      summary: true,
      tagline: true,
      images: {
        select: {
          kind: true,
          sourcePath: true,
          key: true,
          contentType: true,
          width: true,
          height: true,
        },
      },
    },
  });

  const { cover } = meta;
  const storedByKind = new Map(stored?.images.map((i) => [i.kind, i]) ?? []);
  const kept: StoredImage[] = [];
  const toFetch: { kind: WorkshopCoverKind; path: string }[] = [];
  for (const kind of KINDS) {
    const path = cover[kind];
    if (!path) continue;
    const current = storedByKind.get(kind);
    // The sync names a file after its own hash, so an equal path is an equal
    // picture and there is nothing to download.
    if (current?.sourcePath === path) kept.push(current);
    else toFetch.push({ kind, path });
  }

  if (
    stored &&
    stored.title === cover.title &&
    stored.summary === cover.summary &&
    stored.tagline === cover.tagline &&
    toFetch.length === 0 &&
    kept.length === stored.images.length
  ) {
    return {
      status: 'unchanged',
      detail: "L'aperçu de l'activité est déjà à jour.",
    };
  }

  const storage = getStorage();
  const uploaded: StoredImage[] = [];
  try {
    for (const { kind, path } of toFetch) {
      const image = await copyImage(instance, kind, path);
      await storage.save(image.key, image.bytes, image.contentType);
      uploaded.push(image.row);
    }
    const images = [...kept, ...uploaded];
    await prisma.$transaction([
      prisma.workshop_Cover.upsert({
        where: { instanceId: instance.id },
        create: {
          instanceId: instance.id,
          title: cover.title,
          summary: cover.summary,
          tagline: cover.tagline,
          fetchedAt: new Date(),
        },
        update: {
          title: cover.title,
          summary: cover.summary,
          tagline: cover.tagline,
          fetchedAt: new Date(),
        },
      }),
      prisma.workshop_CoverImage.deleteMany({
        where: { instanceId: instance.id },
      }),
      prisma.workshop_CoverImage.createMany({
        data: images.map((image) => ({ instanceId: instance.id, ...image })),
      }),
    ]);
  } catch (err) {
    // Nothing references what this attempt uploaded unless the transaction
    // landed, so it goes. A key that was already stored is never in this list.
    const storedKeys = new Set(stored?.images.map((i) => i.key));
    await Promise.all(
      uploaded
        .filter((image) => !storedKeys.has(image.key))
        .map((image) => storage.delete(image.key).catch(() => {})),
    );
    throw err;
  }

  // Only now that no row points at them. A picture re-uploaded under the same
  // content-addressed key is still referenced and stays.
  const liveKeys = new Set([...kept, ...uploaded].map((i) => i.key));
  await Promise.all(
    (stored?.images ?? [])
      .filter((image) => !liveKeys.has(image.key))
      .map((image) => storage.delete(image.key).catch(() => {})),
  );

  return {
    status: 'fetched',
    detail: `Aperçu repris de l'instance : ${describe(cover.tagline, [...kept, ...uploaded])}.`,
  };
}

async function readMeta(baseUrl: string): Promise<z.infer<typeof metaAnswer>> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${META_PATH}`, {
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    });
  } catch {
    throw new CoverRefusal(
      'unreachable',
      `L'instance ne répond pas à ${baseUrl}${META_PATH}. L'aperçu enregistré est conservé.`,
    );
  }
  if (response.status === 404) {
    throw new CoverRefusal(
      'no_cover',
      "L'instance n'a pas encore d'aperçu à donner : aucun sujet n'y est synchronisé, ou son extension est trop ancienne. L'aperçu enregistré est conservé.",
    );
  }
  if (!response.ok) {
    throw new CoverRefusal(
      'unreachable',
      `L'instance a répondu ${response.status} à ${META_PATH}. L'aperçu enregistré est conservé.`,
    );
  }
  const parsed = metaAnswer.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new CoverRefusal(
      'invalid',
      `La réponse de l'instance à ${META_PATH} n'a pas la forme attendue. L'aperçu enregistré est conservé.`,
    );
  }
  return parsed.data;
}

async function copyImage(
  instance: { id: string; baseUrl: string },
  kind: WorkshopCoverKind,
  path: string,
): Promise<{
  key: string;
  bytes: Uint8Array;
  contentType: string;
  row: StoredImage;
}> {
  const refuse = (why: string) =>
    new CoverRefusal(
      'invalid',
      `L'image « ${kind} » (${path}) ${why}. L'aperçu enregistré est conservé.`,
    );

  let response: Response;
  try {
    response = await fetch(new URL(path, instance.baseUrl), {
      redirect: 'error',
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
  } catch {
    throw refuse("n'a pas pu être téléchargée");
  }
  if (!response.ok) throw refuse(`a répondu ${response.status}`);
  const declared = Number(response.headers.get('content-length'));
  if (declared > COVER_IMAGE_MAX_BYTES) throw refuse('dépasse 6 Mo');
  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw.byteLength > COVER_IMAGE_MAX_BYTES) throw refuse('dépasse 6 Mo');

  const type = sniffImageType(raw);
  if (!type) throw refuse("n'est ni un GIF, ni un PNG, ni un JPEG, ni un WebP");

  let stored: { bytes: Uint8Array; contentType: string; extension: string };
  let size: { width: number; height: number } | null;
  if (type === 'gif') {
    // Kept byte for byte: the pipeline re-encodes to a single still, which
    // would flatten the animation the subject chose.
    size = readGifSize(raw);
    stored = { bytes: raw, contentType: 'image/gif', extension: 'gif' };
  } else {
    // Re-encoded like every image Jump stores, which also drops EXIF.
    const processed = await processImage(raw, {
      maxEdge: MAX_EDGE[kind],
      quality: WEBP_QUALITY,
    }).catch(() => null);
    if (!processed) throw refuse("n'a pas pu être lue");
    size = { width: processed.width, height: processed.height };
    stored = {
      bytes: processed.bytes,
      contentType: processed.contentType,
      extension: 'webp',
    };
  }
  if (!size) throw refuse("n'a pas de dimensions lisibles");

  const digest = createHash('sha256')
    .update(stored.bytes)
    .digest('hex')
    .slice(0, 16);
  const key = workshopCoverKey(instance.id, kind, digest, stored.extension);
  return {
    key,
    bytes: stored.bytes,
    contentType: stored.contentType,
    row: {
      kind,
      sourcePath: path,
      key,
      contentType: stored.contentType,
      ...size,
    },
  };
}

function describe(tagline: string | null, images: StoredImage[]): string {
  const parts = [tagline ? `accroche « ${tagline} »` : "pas d'accroche"];
  const kinds = images.map((i) => IMAGE_LABEL_FR[i.kind]);
  parts.push(kinds.length > 0 ? kinds.join(', ') : 'aucune image');
  return parts.join(', ');
}

const IMAGE_LABEL_FR: Record<WorkshopCoverKind, string> = {
  media: 'visuel',
  poster: 'image fixe',
  mascot: 'mascotte',
};
