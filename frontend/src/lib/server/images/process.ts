// Shared server-side image processing: decode, downscale, re-encode to WebP.
//
// Uses the built-in `Bun.Image` API (Bun >= 1.3.14) rather than a native module
// such as sharp: it ships with the runtime, so there is no prebuilt-binary /
// musl friction on our Alpine base. See the Dockerfile pin and `engines.bun`.
//
// One pipeline, parameterized by output size: CMS content images downscale to a
// large edge, persona avatars to a small one. Callers own their own upload-size
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
const DEFAULT_MAX_INPUT_PIXELS = 4096 * 4096; // ~16.8 MP, comfortably above any photo

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
  /** Header-level canvas guard; defaults to ~16.8 MP. */
  maxInputPixels?: number;
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
 * Decode, downscale and re-encode an uploaded image to WebP, off the JS thread.
 *
 * `autoOrient` (the Bun.Image default) bakes JPEG EXIF orientation into the
 * pixels and then drops metadata, so the stored image renders upright and we
 * never persist EXIF geolocation (RGPD hygiene). The re-encode also normalises
 * every accepted input format to a single served type.
 */
export async function processImage(
  input: Uint8Array,
  {
    maxEdge,
    quality,
    maxInputPixels = DEFAULT_MAX_INPUT_PIXELS,
  }: ProcessImageOptions,
): Promise<ProcessedImage> {
  assertBunImage();
  const bytes = await new Bun.Image(input, { maxPixels: maxInputPixels })
    .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .bytes();
  const { width, height } = await new Bun.Image(bytes).metadata();
  return { bytes, contentType: 'image/webp', width, height };
}
