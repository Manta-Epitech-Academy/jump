/**
 * A picture an admin points Jump at, copied into storage and served by Jump.
 *
 * Copied, never linked to: a minor's browser fetches nothing from another host
 * (DESIGN.md, avatars), and a page must not break the day the host moves a file.
 * So whatever authored content carries a picture (an activity's cover, a
 * campus's highlighted event) hands an https address to a write, and the write
 * downloads it here, once, before anything is stored.
 *
 * The address is chosen by an admin and fetched from inside the cluster, which
 * shapes every rule below: no redirect is followed (an answer from somewhere
 * else is not the picture that was named), the bytes are sniffed rather than
 * trusted to the extension or the `Content-Type`, and a refusal never echoes
 * what the other end answered.
 */

import { createHash } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { getStorage } from '$lib/server/infra/storage';
import { processImage, readGifSize, sniffImageType } from './process';

/**
 * Shown to every talent of a campus, on phones, often on mobile data: past this
 * a picture is not a picture any more, it is a video.
 */
export const REMOTE_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const WEBP_QUALITY = 80;

/**
 * The shape of a picture drawn in the talent hero's picture slot, refused at
 * write time rather than cropped at render time: an admin who sees the refusal
 * picks another picture, a talent who sees a crop sees half a mascot.
 *
 * Wide enough not to blur at the slot's largest size, and between square and
 * cinema: a portrait picture would push the hero's line and button off a phone
 * screen, a banner would read as a stripe.
 */
export const HERO_PICTURE_FRAME = {
  minWidth: 480,
  minRatio: 1,
  maxRatio: 21 / 9,
} as const;

export type PictureFrame = {
  minWidth: number;
  /** Width over height. */
  minRatio: number;
  maxRatio: number;
};

export type CopiedImage = {
  bytes: Uint8Array;
  contentType: string;
  /** File extension of the stored bytes, for a key. */
  extension: string;
  width: number;
  height: number;
  /** Of the stored bytes: equal pictures get equal keys, so a repeat is free. */
  digest: string;
};

/**
 * Why a picture was refused, as the end of a French sentence the caller opens
 * with what the picture was for (« Le visuel (https://...) dépasse 6 Mo. »).
 */
export class RemoteImageRefusal extends Error {}

export async function copyRemoteImage(
  url: URL,
  options: {
    /** Longest stored edge, past which a still is downscaled. */
    maxEdge: number;
    /**
     * Whether an animated GIF is acceptable. It is then kept byte for byte,
     * since the pipeline re-encodes to a single still and would flatten it.
     */
    animated: boolean;
    frame?: PictureFrame;
  },
): Promise<CopiedImage> {
  const refuse = (why: string) => new RemoteImageRefusal(why);

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw refuse(
      "n'a pas pu être téléchargée (adresse injoignable, trop lente, ou qui redirige ailleurs : donner l'adresse finale de l'image)",
    );
  }
  if (!response.ok) throw refuse(`a répondu ${response.status}`);
  const declared = Number(response.headers.get('content-length'));
  if (declared > REMOTE_IMAGE_MAX_BYTES) throw refuse('dépasse 6 Mo');
  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw.byteLength > REMOTE_IMAGE_MAX_BYTES) throw refuse('dépasse 6 Mo');

  const type = sniffImageType(raw);
  if (!type) throw refuse("n'est ni un GIF, ni un PNG, ni un JPEG, ni un WebP");

  let stored: Omit<CopiedImage, 'digest'>;
  if (type === 'gif') {
    if (!options.animated) {
      throw refuse(
        'est un GIF, accepté seulement pour le visuel animé : donner un PNG, un JPEG ou un WebP',
      );
    }
    const size = readGifSize(raw);
    if (!size) throw refuse("n'a pas de dimensions lisibles");
    stored = {
      bytes: raw,
      contentType: 'image/gif',
      extension: 'gif',
      ...size,
    };
  } else {
    // Re-encoded like every image Jump stores, which also drops EXIF.
    const processed = await processImage(raw, {
      maxEdge: options.maxEdge,
      quality: WEBP_QUALITY,
    }).catch(() => null);
    if (!processed) throw refuse("n'a pas pu être lue");
    stored = { ...processed, extension: 'webp' };
  }

  const { frame } = options;
  if (frame) {
    const ratio = stored.width / stored.height;
    if (stored.width < frame.minWidth) {
      throw refuse(
        `fait ${stored.width} px de large, il en faut au moins ${frame.minWidth}`,
      );
    }
    if (ratio < frame.minRatio || ratio > frame.maxRatio) {
      throw refuse(
        `est au format ${stored.width} × ${stored.height} : il faut une image horizontale, entre le carré et le 21:9`,
      );
    }
  }

  const digest = createHash('sha256')
    .update(stored.bytes)
    .digest('hex')
    .slice(0, 16);
  return { ...stored, digest };
}

export type StoredObject = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
};

/**
 * Replace the pictures a row references, without ever leaving it pointing at
 * nothing or leaving bytes nobody points at.
 *
 * `next` is every picture of the new state, `previousKeys` every key of the old
 * one. The new bytes are stored first, then `commit` swaps the references in
 * one transaction; if it throws, only what this call stored goes. After the
 * commit, an old key the new state no longer names is deleted. A picture that
 * comes back under the same content-addressed key is neither re-stored nor
 * deleted.
 */
export async function swapStoredImages<T>({
  next,
  previousKeys,
  commit,
}: {
  next: StoredObject[];
  previousKeys: readonly string[];
  commit: () => Promise<T>;
}): Promise<T> {
  const storage = getStorage();
  const previous = new Set(previousKeys);
  const added: string[] = [];
  let result: T;
  try {
    for (const object of next) {
      if (previous.has(object.key)) continue;
      await storage.save(object.key, object.bytes, object.contentType);
      added.push(object.key);
    }
    result = await commit();
  } catch (err) {
    await Promise.all(added.map((key) => storage.delete(key).catch(() => {})));
    throw err;
  }

  const live = new Set(next.map((object) => object.key));
  await Promise.all(
    previousKeys
      .filter((key) => !live.has(key))
      .map((key) => storage.delete(key).catch(() => {})),
  );
  return result;
}

/**
 * The response serving one stored picture, for a proxy that has already checked
 * a row references `key`. The key is content-addressed (a new picture is a new
 * URL), which is what makes caching it forever safe.
 */
export async function storedImageResponse(
  key: string,
  contentType: string,
): Promise<Response> {
  let buffer: Buffer;
  try {
    buffer = await getStorage().get(key);
  } catch {
    throw error(404);
  }
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
