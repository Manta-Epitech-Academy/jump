/**
 * A picture an admin points Jump at, copied into storage and served by Jump.
 *
 * Copied, never linked to: a minor's browser fetches nothing from another host
 * (DESIGN.md, avatars), and a page must not break the day the host moves a file.
 * So whatever authored content carries a picture (an activity's cover, a
 * campus's highlighted event) hands an https address to a write, and the write
 * downloads it here before anything is stored.
 *
 * What the admin gives is taken as it is: any proportion, any size, still or
 * animated. Laying a picture out is the page's job, not a reason to refuse it.
 * What is refused is only what would hurt somebody else: an address inside the
 * cluster, a file that is not a picture Jump can show, an animation too heavy
 * for a phone on mobile data, a canvas too large for the pod to decode.
 *
 * The address is chosen by an admin, or by a model holding an admin's token,
 * and fetched from inside the cluster, which shapes every rule below. Only a
 * public address is dialled (`infra/publicAddress.ts`), and it is checked on
 * the address the connection is actually made to, so a name cannot pass the
 * check and resolve somewhere else a moment later. A redirect is followed the
 * way the first request was made, every hop checked again, so a public address
 * cannot hand the request on to an internal one. The body is read up to the
 * size cap and no further, whatever the headers announced. The bytes are
 * sniffed rather than trusted to the extension or the `Content-Type`. And a
 * refusal names the status at most, never the body.
 */

import { lookup as dnsLookup } from 'node:dns';
import { get as httpGet, type IncomingMessage } from 'node:http';
import { get as httpsGet } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { error } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { isPublicAddress } from '$lib/server/infra/publicAddress';
import { getStorage } from '$lib/server/infra/storage';
import { randomBytes } from 'node:crypto';
import { stillKeyOf } from '$lib/domain/pictures';
import {
  CanvasTooLargeError,
  describeCanvas,
  MAX_INPUT_PIXELS,
  processImage,
  readGifSize,
  sniffImageType,
  unsupportedImageName,
} from './process';

/**
 * The most a download reads. A still is re-encoded (`processImage`) to a size
 * that has nothing to do with this, so the cap only bounds what the pod holds
 * while decoding, and a photograph straight off a camera fits under it.
 */
export const REMOTE_DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024;

/**
 * An animation is served byte for byte (re-encoding would flatten it), to every
 * talent of a campus, on phones, often on mobile data: past this it is not a
 * picture any more, it is a video.
 */
export const REMOTE_ANIMATION_MAX_BYTES = 6 * 1024 * 1024;

const TIMEOUT_MS = 15_000;

/**
 * Sent with every download. Some hosts (Wikimedia among them) answer 403 to a
 * request that does not say who is asking, which would refuse a picture the
 * admin can open in any browser for a reason that has nothing to do with it.
 */
const REQUEST_HEADERS = {
  'user-agent': 'Jump/1.0 (Epitech Academy; picture copy)',
  accept: 'image/*',
};
const WEBP_QUALITY = 80;
const MAX_REDIRECTS = 5;

/** Longest edge of the still derived from an animation. */
const STILL_MAX_EDGE = 1280;

export type CopiedImage = {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
  width: number;
  height: number;
  /**
   * For an animation, its first frame as a WebP: what a talent who asked for
   * reduced motion sees instead. Null for a still.
   */
  still: Uint8Array | null;
};

/**
 * Why a picture was refused, as the end of a French sentence the caller opens
 * with what the picture was for (« Le visuel (https://...) dépasse 20 Mo. »).
 */
export class RemoteImageRefusal extends Error {}

const refuse = (why: string) => new RemoteImageRefusal(why);
const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} Mo`;
const NOT_PUBLIC =
  'désigne une adresse interne : seule une adresse publique est acceptée';
const UNREACHABLE =
  "n'a pas pu être téléchargée (adresse injoignable ou trop lente)";
const TOO_LARGE = `dépasse ${megabytes(REMOTE_DOWNLOAD_MAX_BYTES)}`;

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

/** A response that sends the request elsewhere, and where. */
type Answer = { body: Uint8Array } | { location: string };

/**
 * One request to `url`, from a public address only, within the time and size
 * caps. A redirect is answered as its `Location`, for `download` to follow.
 *
 * An address written as an IP is checked here, since a request never consults
 * its lookup for one. `http:` is served too, for the test server the
 * integration suite stands up: the operation boundary is what holds an admin to
 * https, and `download` never lets a redirect leave https.
 */
function request(url: URL): Promise<Answer> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicAddress(host)) {
    return Promise.reject(refuse(NOT_PUBLIC));
  }

  const get = url.protocol === 'https:' ? httpsGet : httpGet;
  return new Promise((resolve, reject) => {
    const req = get(
      url,
      {
        lookup: publicLookup,
        headers: REQUEST_HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
      (response: IncomingMessage) => {
        const fail = (why: string) => {
          response.destroy();
          reject(refuse(why));
        };
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          const location = response.headers.location;
          response.destroy();
          if (!location) return reject(refuse(`a répondu ${status}`));
          return resolve({ location });
        }
        if (status < 200 || status >= 300) return fail(`a répondu ${status}`);
        if (
          Number(response.headers['content-length']) > REMOTE_DOWNLOAD_MAX_BYTES
        ) {
          return fail(TOO_LARGE);
        }

        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > REMOTE_DOWNLOAD_MAX_BYTES) fail(TOO_LARGE);
          else chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({ body: new Uint8Array(Buffer.concat(chunks)) }),
        );
        response.on('error', () => reject(refuse(UNREACHABLE)));
      },
    );
    req.on('error', (err: NodeJS.ErrnoException) =>
      reject(
        refuse(
          err.code === 'ERR_NON_PUBLIC_ADDRESS' ? NOT_PUBLIC : UNREACHABLE,
        ),
      ),
    );
  });
}

/**
 * The body at `url`, following redirects the way a browser would, each hop a
 * request of its own and checked as such. A hop that leaves https, or a chain
 * that does not end, is refused.
 */
async function download(url: URL): Promise<Uint8Array> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const answer = await request(current);
    if ('body' in answer) return answer.body;
    let next: URL;
    try {
      next = new URL(answer.location, current);
    } catch {
      throw refuse('redirige vers une adresse illisible');
    }
    if (current.protocol === 'https:' && next.protocol !== 'https:')
      throw refuse('redirige vers une adresse qui n’est pas en https');
    if (next.protocol !== 'https:' && next.protocol !== 'http:')
      throw refuse('redirige vers une adresse qui n’est pas une page web');
    current = next;
  }
  throw refuse(`redirige plus de ${MAX_REDIRECTS} fois de suite`);
}

const ACCEPTED_FORMATS = 'un PNG, un JPEG, un WebP ou un GIF';

/** Re-encode, or say in French why the picture cannot be. */
async function reencode(raw: Uint8Array, maxEdge: number) {
  try {
    return await processImage(raw, { maxEdge, quality: WEBP_QUALITY });
  } catch (err) {
    if (err instanceof CanvasTooLargeError) {
      throw refuse(
        `fait ${describeCanvas(err)}, au-delà de ${Math.floor(MAX_INPUT_PIXELS / 1_000_000)} mégapixels : en donner une version plus petite`,
      );
    }
    throw refuse("n'a pas pu être lue");
  }
}

/**
 * Download a picture and turn it into what Jump stores: a still re-encoded to
 * WebP within `maxEdge`, or an animation kept byte for byte with its first
 * frame beside it as a still.
 */
export async function copyRemoteImage(
  url: URL,
  options: {
    /** Longest stored edge, past which a still is downscaled. */
    maxEdge: number;
  },
): Promise<CopiedImage> {
  const raw = await download(url);

  const type = sniffImageType(raw);
  if (!type) {
    const name = unsupportedImageName(raw);
    throw refuse(
      name
        ? `est un ${name}, que Jump ne sait pas afficher : en donner ${ACCEPTED_FORMATS}`
        : `n'est pas une image (attendu : ${ACCEPTED_FORMATS})`,
    );
  }

  if (type === 'gif') {
    if (raw.byteLength > REMOTE_ANIMATION_MAX_BYTES) {
      throw refuse(
        `est un GIF de plus de ${megabytes(REMOTE_ANIMATION_MAX_BYTES)}, trop lourd pour un téléphone : en donner une version compressée`,
      );
    }
    const size = readGifSize(raw);
    if (!size) throw refuse("n'a pas de dimensions lisibles");
    const still = await reencode(
      raw,
      Math.min(options.maxEdge, STILL_MAX_EDGE),
    );
    return {
      bytes: raw,
      contentType: 'image/gif',
      extension: 'gif',
      ...size,
      still: still.bytes,
    };
  }

  // Re-encoded like every image Jump stores, which also drops EXIF.
  const processed = await reencode(raw, options.maxEdge);
  return { ...processed, extension: 'webp', still: null };
}

export type StoredObject = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
};

/**
 * Replace the pictures a row references, without ever leaving it pointing at
 * nothing or leaving bytes nobody points at, however many writes overlap.
 *
 * It rests on one rule the caller keeps: every key in `next` is new, minted for
 * this write and never used before. A key then has exactly one party that may
 * delete it, the write that stored it if that write fails, or the write whose
 * transaction replaced it, so nothing another writer does can bring back a key
 * this one deletes. That is also what keeps every byte outside the
 * transaction, where a slow upload cannot hold a lock or time a commit out.
 *
 * The new bytes are stored first. `commit` then swaps the references in one
 * transaction and answers the keys it replaced, which it must read under a lock
 * serialising writers of those rows: two writers reading the same old keys
 * would each delete those, and the first one's new pictures would be left
 * behind with nothing pointing at them. If anything fails, what this call
 * stored goes; once the commit lands, what it replaced goes.
 */
export async function swapStoredImages<T>({
  next,
  commit,
}: {
  next: StoredObject[];
  commit: (
    tx: Prisma.TransactionClient,
  ) => Promise<{ replaced: readonly string[]; result: T }>;
}): Promise<T> {
  const storage = getStorage();
  const discard = (keys: readonly string[]) =>
    Promise.all(keys.map((key) => storage.delete(key).catch(() => {})));

  let outcome: Awaited<ReturnType<typeof commit>>;
  try {
    for (const object of next) {
      await storage.save(object.key, object.bytes, object.contentType);
    }
    outcome = await prisma.$transaction(commit);
  } catch (err) {
    await discard(next.map((object) => object.key));
    throw err;
  }
  await discard(outcome.replaced);
  return outcome.result;
}

/** A picture a row references, as `replacePictures` reads and writes it. */
export type StoredPicture = {
  /** Which place of the row it fills: a cover kind, the highlight's one slot. */
  slot: string;
  sourceUrl: string;
  key: string;
  /** The still of an animation, null for a still. */
  stillKey: string | null;
  contentType: string;
  width: number;
  height: number;
};

/** One picture a write asks for. */
export type PictureRequest = {
  slot: string;
  sourceUrl: string;
  /** Longest stored edge of a still. */
  maxEdge: number;
};

/**
 * Whether a stored copy is everything a fresh copy would be: an animation
 * carries its still. Every row written since stills were derived is whole; one
 * that is not is copied again the next time its address is restated.
 */
function isWholeCopy(picture: StoredPicture): boolean {
  return picture.contentType !== 'image/gif' || picture.stillKey !== null;
}

/** A reused picture another write replaced between the read and the lock. */
class ReusedPictureGone extends Error {}

/**
 * Point a row at the pictures a write asks for, copying only what it does not
 * already hold.
 *
 * A request whose address is the one its slot was already copied from keeps
 * that copy: correcting a line of text must not fail because the host of a
 * picture stopped answering, nor wait on a download that changes nothing. A
 * copy is kept only when it is whole, though (`isWholeCopy`): an animation
 * copied before stills were derived has none, and keeping it would leave a
 * talent who asked for reduced motion with the animation for good. Any other
 * request is downloaded, under a key minted for this write, so the rule
 * `swapStoredImages` rests on (every stored key is new) holds for everything
 * this call stores. The decision is taken before the lock, since downloads
 * cannot wait inside a transaction; if another write replaced a kept picture
 * in between, the whole thing is taken again from the top, which only an
 * overlapping write on the same row can cause.
 *
 * `readStored` gives what the row references, outside the transaction and then
 * inside it after `lock`. `commit` writes the row's picture references to
 * exactly `pictures`, in request order; what it no longer references is
 * deleted once it lands.
 */
export async function replacePictures<T>({
  requests,
  keyFor,
  refusal,
  readStored,
  lock,
  commit,
}: {
  requests: PictureRequest[];
  /** The key of a freshly copied picture, from its request and the write's id. */
  keyFor: (
    request: PictureRequest,
    writeId: string,
    extension: string,
  ) => string;
  /** The refusal the operation throws for a picture that cannot be copied. */
  refusal: (request: PictureRequest, why: string) => Error;
  readStored: (db: Prisma.TransactionClient) => Promise<StoredPicture[]>;
  lock: (tx: Prisma.TransactionClient) => Promise<void>;
  commit: (
    tx: Prisma.TransactionClient,
    pictures: StoredPicture[],
  ) => Promise<T>;
}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const stored = await readStored(prisma);
    const kept = requests.map(
      (request) =>
        stored.find(
          (picture) =>
            picture.slot === request.slot &&
            picture.sourceUrl === request.sourceUrl &&
            isWholeCopy(picture),
        ) ?? null,
    );

    const writeId = randomBytes(8).toString('hex');
    const copies = await Promise.all(
      requests.map(async (request, i) => {
        if (kept[i]) return null;
        try {
          return await copyRemoteImage(new URL(request.sourceUrl), {
            maxEdge: request.maxEdge,
          });
        } catch (err) {
          if (!(err instanceof RemoteImageRefusal)) throw err;
          throw refusal(request, err.message);
        }
      }),
    );

    const next: StoredObject[] = [];
    const pictures = requests.map((request, i): StoredPicture => {
      const reused = kept[i];
      if (reused) return { ...reused, slot: request.slot };
      const copy = copies[i]!;
      const key = keyFor(request, writeId, copy.extension);
      const stillKey = copy.still ? stillKeyOf(key) : null;
      next.push({ key, bytes: copy.bytes, contentType: copy.contentType });
      if (copy.still && stillKey) {
        next.push({
          key: stillKey,
          bytes: copy.still,
          contentType: 'image/webp',
        });
      }
      return {
        slot: request.slot,
        sourceUrl: request.sourceUrl,
        key,
        stillKey,
        contentType: copy.contentType,
        width: copy.width,
        height: copy.height,
      };
    });

    try {
      return await swapStoredImages({
        next,
        commit: async (tx) => {
          await lock(tx);
          const current = await readStored(tx);
          const currentKeys = new Set(current.map((picture) => picture.key));
          if (kept.some((picture) => picture && !currentKeys.has(picture.key)))
            throw new ReusedPictureGone();
          const result = await commit(tx, pictures);
          const referenced = new Set(
            pictures.flatMap((picture) => [picture.key, picture.stillKey]),
          );
          const replaced = current
            .flatMap((picture) => [picture.key, picture.stillKey])
            .filter((key): key is string => !!key && !referenced.has(key));
          return { replaced, result };
        },
      });
    } catch (err) {
      if (err instanceof ReusedPictureGone && attempt < 5) continue;
      throw err;
    }
  }
}

/**
 * The response serving one stored picture, for a proxy that has already checked
 * a row references `key`. A key is never reused (a new picture is a new URL),
 * which is what makes caching it forever safe.
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
