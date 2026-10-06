/**
 * A picture an admin points Jump at, copied into storage and served by Jump.
 *
 * Copied, never linked to: a minor's browser fetches nothing from another host
 * (DESIGN.md, avatars), and a page must not break the day the host moves a file.
 * So whatever authored content carries a picture (an activity's cover, a
 * campus's highlighted event) hands an https address to a write, and the write
 * downloads it here, once, before anything is stored.
 *
 * The address is chosen by an admin, or by a model holding an admin's token,
 * and fetched from inside the cluster, which shapes every rule below. Only a
 * public address is dialled (`infra/publicAddress.ts`), and it is checked on
 * the address the connection is actually made to, so a name cannot pass the
 * check and resolve somewhere else a moment later. No redirect is followed (an
 * answer from somewhere else is not the picture that was named). The body is
 * read up to the size cap and no further, whatever the headers announced. The
 * bytes are sniffed rather than trusted to the extension or the
 * `Content-Type`. And a refusal names the status at most, never the body.
 */

import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns';
import { get as httpGet, type IncomingMessage } from 'node:http';
import { get as httpsGet } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { error } from '@sveltejs/kit';
import { isPublicAddress } from '$lib/server/infra/publicAddress';
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

const refuse = (why: string) => new RemoteImageRefusal(why);
const NOT_PUBLIC =
  'désigne une adresse interne : seule une adresse publique est acceptée';
const UNREACHABLE =
  "n'a pas pu être téléchargée (adresse injoignable ou trop lente)";
const TOO_LARGE = 'dépasse 6 Mo';

/** Raised from the lookup, so the request fails before it connects. */
class NonPublicAddressError extends Error {
  readonly code = 'ERR_NON_PUBLIC_ADDRESS';
}

/**
 * The resolver handed to the request: every address the name resolves to has
 * to be public, and the one returned is the one connected to, so nothing
 * resolves the name a second time behind the check.
 */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    if (
      addresses.length === 0 ||
      addresses.some((entry) => !isPublicAddress(entry.address))
    ) {
      return callback(new NonPublicAddressError(), '');
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

/**
 * The body at `url`, from a public address only, within the time and size caps.
 *
 * An address written as an IP is checked here, since a request never consults
 * its lookup for one. `http:` is served too, for the test server the
 * integration suite stands up: the operation boundary is what holds an admin to
 * https.
 */
function download(url: URL): Promise<Uint8Array> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicAddress(host)) {
    return Promise.reject(refuse(NOT_PUBLIC));
  }

  const get = url.protocol === 'https:' ? httpsGet : httpGet;
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      { lookup: publicLookup, signal: AbortSignal.timeout(TIMEOUT_MS) },
      (response: IncomingMessage) => {
        const fail = (why: string) => {
          response.destroy();
          reject(refuse(why));
        };
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          return fail("redirige ailleurs : donner l'adresse finale de l'image");
        }
        if (status < 200 || status >= 300) return fail(`a répondu ${status}`);
        if (
          Number(response.headers['content-length']) > REMOTE_IMAGE_MAX_BYTES
        ) {
          return fail(TOO_LARGE);
        }

        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > REMOTE_IMAGE_MAX_BYTES) fail(TOO_LARGE);
          else chunks.push(chunk);
        });
        response.on('end', () =>
          resolve(new Uint8Array(Buffer.concat(chunks))),
        );
        response.on('error', () => reject(refuse(UNREACHABLE)));
      },
    );
    request.on('error', (err: NodeJS.ErrnoException) =>
      reject(
        refuse(
          err.code === 'ERR_NON_PUBLIC_ADDRESS' ? NOT_PUBLIC : UNREACHABLE,
        ),
      ),
    );
  });
}

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
  const raw = await download(url);

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
