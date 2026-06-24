// Server-side processing for images embedded in CMS content (welcome message).
//
// Thin wrapper over the shared `processImage` pipeline ($lib/server/images),
// pinning the CMS-specific output size. Kept as its own module so the CMS upload
// endpoint imports CMS-named constants, not the generic ones.

import {
  processImage,
  IMAGE_INPUT_TYPES,
  type ProcessedImage,
} from '$lib/server/images/process';

/**
 * Input types we accept for upload. See {@link IMAGE_INPUT_TYPES} for why the
 * list is restricted to JPEG/PNG/WebP.
 */
export const CMS_IMAGE_INPUT_TYPES = IMAGE_INPUT_TYPES;

/** Hard cap on the raw upload, before downscaling. */
export const CMS_IMAGE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Longest edge of the stored image. A 4K original is downscaled to this. */
const MAX_EDGE = 1600;
const WEBP_QUALITY = 80;

export type ProcessedCmsImage = ProcessedImage;

/** Decode, downscale to 1600px and re-encode an uploaded CMS image to WebP. */
export async function processCmsImage(
  input: Uint8Array,
): Promise<ProcessedCmsImage> {
  return processImage(input, { maxEdge: MAX_EDGE, quality: WEBP_QUALITY });
}
