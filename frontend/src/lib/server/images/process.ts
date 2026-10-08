// Shared server-side image processing: decode, downscale, re-encode to WebP.
//
// Uses the built-in `Bun.Image` API (Bun >= 1.3.14) rather than a native module
// such as sharp: it ships with the runtime, so there is no prebuilt-binary /
// musl friction on our Alpine base. See the Dockerfile pin and `engines.bun`.
//
// One pipeline, parameterized by output size: pictures copied from an address
// (`remote.ts`) downscale to a large edge, persona avatars to a small one. Callers own their own upload-size
// and mime validation; this module only transforms already-accepted bytes.

/**
 * Input types we accept. Restricted to the formats `Bun.Image` can decode on
 * Linux (our prod/Alpine target). HEIC/AVIF/TIFF are macOS- and Windows-only in
 * Bun.Image, so we reject them up front with a clear message rather than letting
 * decode fail mid-pipeline.
 *
 * GIF is deliberately excluded: the pipeline re-encodes every upload to a single
 * still WebP, so an animated GIF would be silently flattened to its first frame.
 * Rejecting the format is more honest than storing a broken-looking still.
 */
export const IMAGE_INPUT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/**
 * Reject an absurdly large canvas before decoding. We downscale to `maxEdge`
 * regardless, so anything past a handful of megapixels is wasted decode work;
 * this also caps the transient pixel buffer far below Bun.Image's ~268 MP
 * (Sharp-parity) default. The check reads the header and runs before any pixel
 * buffer is allocated, so a tiny file claiming a huge canvas is refused cheaply.
 */
export const MAX_INPUT_PIXELS = 4096 * 4096; // ~16.8 MP

/**
 * A canvas past `MAX_INPUT_PIXELS`, with the size its header announced, so a
 * refusal can say what was received and what to send instead rather than
 * that the picture « could not be read ».
 */
export class CanvasTooLargeError extends Error {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    super(`canvas ${width} x ${height} exceeds ${MAX_INPUT_PIXELS} pixels`);
  }
}

/** « 5712 × 4284 px », the way a refusal names a canvas. */
export function describeCanvas({ width, height }: CanvasTooLargeError): string {
  return `${width} × ${height} px`;
}

export type ProcessedImage = {
  bytes: Uint8Array;
  contentType: 'image/webp';
  width: number;
  height: number;
};

export type ProcessImageOptions = {
  /** Longest edge of the stored image; larger originals are downscaled to it. */
  maxEdge: number;
  /** WebP quality (0-100). */
  quality: number;
};

function assertBunImage(): void {
  // Fail loud on a runtime older than 1.3.14 rather than throwing an opaque
  // "Bun.Image is not a constructor" deep in the pipeline.
  if (typeof Bun?.Image === 'undefined') {
    throw new Error(
      'Bun.Image indisponible : Bun >= 1.3.14 est requis pour le traitement des images.',
    );
  }
}

/**
 * Decode, downscale and re-encode an image to WebP, off the JS thread. A GIF is
 * decoded to its first frame, which is how an animation gets the still a
 * talent who asked for reduced motion sees instead (`remote.ts`). A canvas past
 * `MAX_INPUT_PIXELS` throws `CanvasTooLargeError`.
 *
 * `autoOrient` (the Bun.Image default) bakes JPEG EXIF orientation into the
 * pixels and then drops metadata, so the stored image renders upright and we
 * never persist EXIF geolocation (RGPD hygiene). The re-encode also normalises
 * every accepted input format to a single served type.
 */
export async function processImage(
  input: Uint8Array,
  { maxEdge, quality }: ProcessImageOptions,
): Promise<ProcessedImage> {
  assertBunImage();
  const bytes = await new Bun.Image(input, { maxPixels: MAX_INPUT_PIXELS })
    .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .bytes()
    .catch(async (err: unknown) => {
      if ((err as { code?: string })?.code !== 'ERR_IMAGE_TOO_MANY_PIXELS')
        throw err;
      // Only the header is read here, so the size is cheap to learn.
      const { width, height } = await new Bun.Image(input).metadata();
      throw new CanvasTooLargeError(width, height);
    });
  const { width, height } = await new Bun.Image(bytes).metadata();
  return { bytes, contentType: 'image/webp', width, height };
}

/** What a file's first bytes say it is, whatever it was named or served as. */
export type SniffedImageType = 'gif' | 'png' | 'jpeg' | 'webp';

const startsWith = (bytes: Uint8Array, prefix: number[], at = 0) =>
  bytes.length >= at + prefix.length &&
  prefix.every((byte, i) => bytes[at + i] === byte);

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/**
 * The image type from its magic bytes, or null for anything else.
 *
 * For bytes Jump did not receive from a person but fetched itself (an
 * activity's cover), where neither the URL's extension nor the response's
 * `Content-Type` is evidence of anything: what is stored and served back has to
 * be what it claims to be.
 */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a')))
    return 'gif';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8))
    return 'webp';
  return null;
}

/**
 * The name of a picture format Jump recognises but cannot show, for a refusal
 * that says what was received instead of listing what was expected: an SVG
 * (a document that can carry script, never served), an AVIF or a HEIC (which
 * `Bun.Image` cannot decode on Linux). Null for anything else.
 */
export function unsupportedImageName(
  bytes: Uint8Array,
): 'SVG' | 'AVIF' | 'HEIC' | null {
  // ISO base media: a `ftyp` box first, carrying its major brand and then its
  // compatible ones. An AVIF may name the generic `mif1` as its major brand and
  // `avif` only among the compatible ones, so every brand is read, and AVIF is
  // looked for before the generic brands HEIC shares with it.
  if (startsWith(bytes, ascii('ftyp'), 4)) {
    const brands = ftypBrands(bytes);
    if (brands.some((brand) => brand === 'avif' || brand === 'avis'))
      return 'AVIF';
    if (brands.some((brand) => HEIC_BRANDS.includes(brand))) return 'HEIC';
  }
  // An SVG is XML whose root element is `svg`. What precedes the root is read
  // past rather than searched through: an XML declaration, comments, and a
  // doctype whose internal subset can run for kilobytes (Wikimedia's own logo
  // puts its `<svg` 2.7 kB in), so the doctype's root name is taken as the
  // answer when there is one.
  const prolog = new TextDecoder()
    .decode(bytes.slice(0, 4096))
    .replace(/^\uFEFF/, '')
    .replace(/^(?:\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->)+/, '')
    .toLowerCase();
  if (/^<!doctype\s+svg[\s>]/.test(prolog) || /^<svg[\s>]/.test(prolog))
    return 'SVG';
  return null;
}

/** The `ftyp` brands of a HEIF file that is not an AVIF, generic ones included. */
const HEIC_BRANDS = [
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'mif1',
  'msf1',
];

/**
 * The brands of an ISO base media `ftyp` box: the major brand (offset 8), then
 * the compatible ones from offset 16 to the end of the box, as its big-endian
 * size at offset 0 says, read no further than the bytes there are.
 */
function ftypBrands(bytes: Uint8Array): string[] {
  const size = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
  const end = Math.min(size, bytes.length);
  const brand = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4));
  const brands = [brand(8)];
  for (let at = 16; at + 4 <= end; at += 4) brands.push(brand(at));
  return brands;
}

/**
 * A GIF's canvas size, read off its header without decoding a frame.
 *
 * An animated GIF is kept as it is (the pipeline above would flatten it), so
 * this is the only way to learn its size: two little-endian 16-bit words right
 * after the six-byte signature.
 */
export function readGifSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (sniffImageType(bytes) !== 'gif' || bytes.length < 10) return null;
  const width = bytes[6]! | (bytes[7]! << 8);
  const height = bytes[8]! | (bytes[9]! << 8);
  return width > 0 && height > 0 ? { width, height } : null;
}
