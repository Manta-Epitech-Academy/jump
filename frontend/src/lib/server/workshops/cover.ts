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

import { z } from 'zod';
import { prisma } from '$lib/server/db';
import {
  copyRemoteImage,
  RemoteImageRefusal,
  swapStoredImages,
  type CopiedImage,
} from '$lib/server/images/remote';
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
/** Longest stored edge per picture. The mascot is drawn small. */
const MAX_EDGE: Record<WorkshopCoverKind, number> = {
  media: 1280,
  poster: 1280,
  mascot: 512,
};

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

  const uploaded: (StoredImage & { bytes: Uint8Array })[] = [];
  for (const { kind, path } of toFetch) {
    uploaded.push(await copyImage(instance, kind, path));
  }
  const images: StoredImage[] = [
    ...kept,
    ...uploaded.map(({ bytes: _bytes, ...row }) => row),
  ];
  await swapStoredImages({
    next: uploaded,
    // A kept picture is in neither list, so it is neither re-stored nor deleted.
    previousKeys: (stored?.images ?? [])
      .filter((image) => !kept.includes(image))
      .map((image) => image.key),
    commit: () =>
      prisma.$transaction([
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
      ]),
  });

  return {
    status: 'fetched',
    detail: `Aperçu repris de l'instance : ${describe(cover.tagline, images)}.`,
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
): Promise<StoredImage & { bytes: Uint8Array }> {
  let image: CopiedImage;
  try {
    image = await copyRemoteImage(new URL(path, instance.baseUrl), {
      maxEdge: MAX_EDGE[kind],
      animated: true,
    });
  } catch (err) {
    if (!(err instanceof RemoteImageRefusal)) throw err;
    throw new CoverRefusal(
      'invalid',
      `L'image « ${kind} » (${path}) ${err.message}. L'aperçu enregistré est conservé.`,
    );
  }
  const key = workshopCoverKey(
    instance.id,
    kind,
    image.digest,
    image.extension,
  );
  return {
    kind,
    sourcePath: path,
    key,
    bytes: image.bytes,
    contentType: image.contentType,
    width: image.width,
    height: image.height,
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
