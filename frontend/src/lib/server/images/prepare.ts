import { processImage, readGifSize, sniffImageType } from './process';

// Its own module rather than a function of `process.ts`, so a suite that stubs
// the pipeline (`processImage`, which needs `Bun.Image`) stubs it here too.

const PICTURE_WEBP_QUALITY = 80;

/** Longest edge of the still derived from an animation. */
const STILL_MAX_EDGE = 1280;

export type PreparedPicture = {
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
 * What Jump stores of a picture it has accepted: a still re-encoded to WebP
 * within `maxEdge`, or an animation kept byte for byte (re-encoding would
 * flatten it) with its first frame beside it as a still.
 *
 * Shared by `copyRemoteImage`, which judges the bytes first because it owes an
 * admin a reason for a refusal, and by the seed, which stores its own pictures
 * the way that copy would have. So this throws plainly on what it cannot take:
 * `CanvasTooLargeError` past `MAX_INPUT_PIXELS`, an `Error` on bytes that are
 * no picture Jump can show or a GIF with no readable size.
 */
export async function preparePicture(
  raw: Uint8Array,
  maxEdge: number,
): Promise<PreparedPicture> {
  const type = sniffImageType(raw);
  if (!type) throw new Error('not a picture Jump can show');

  if (type === 'gif') {
    const size = readGifSize(raw);
    if (!size) throw new Error('GIF with no readable size');
    const still = await processImage(raw, {
      maxEdge: Math.min(maxEdge, STILL_MAX_EDGE),
      quality: PICTURE_WEBP_QUALITY,
    });
    return {
      bytes: raw,
      contentType: 'image/gif',
      extension: 'gif',
      ...size,
      still: still.bytes,
    };
  }

  const processed = await processImage(raw, {
    maxEdge,
    quality: PICTURE_WEBP_QUALITY,
  });
  return { ...processed, extension: 'webp', still: null };
}
