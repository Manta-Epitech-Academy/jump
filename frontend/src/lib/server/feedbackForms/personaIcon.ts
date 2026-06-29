// Persona (mascotte) avatar storage for feedback forms.
//
// A form's persona icon is a small uploaded image stored in S3 via the shared
// storage layer, its key held on `Feedback_Form.personaIconKey` (1:1, like
// `Signatory.signatureKey`). Null = the default mascot art. WebP-normalized by
// the shared image pipeline; served through the public persona-icon proxy.

import { prisma } from '$lib/server/db';
import { getStorage } from '$lib/server/infra/storage';
import {
  processImage,
  IMAGE_INPUT_TYPES,
  type ProcessedImage,
} from '$lib/server/images/process';

/** Accepted upload mime types (JPEG/PNG/WebP). Shared with the CMS pipeline. */
export const PERSONA_ICON_INPUT_TYPES = IMAGE_INPUT_TYPES;

/** Hard cap on the raw upload. An avatar never needs more than a couple MB. */
export const PERSONA_ICON_MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

/** Stored edge: the avatar renders at ~28-32px, so 256 covers retina + preview. */
const PERSONA_ICON_MAX_EDGE = 256;
const WEBP_QUALITY = 80;

/** Decode, downscale to 256px and re-encode an uploaded avatar to WebP. */
export function processPersonaIcon(input: Uint8Array): Promise<ProcessedImage> {
  return processImage(input, {
    maxEdge: PERSONA_ICON_MAX_EDGE,
    quality: WEBP_QUALITY,
  });
}

/** A fresh per-form S3 key (mirrors `cms/{uuid}.webp`, `signatures/{uuid}`). */
function newPersonaIconKey(formId: string): string {
  return `feedback-personas/${formId}/${crypto.randomUUID()}.webp`;
}

/**
 * Replaces a form's persona icon with freshly processed bytes: writes the new
 * object, points the row at it, then deletes the previous object best-effort.
 * Returns the new key.
 *
 * Order mirrors the CMS upload's "object landed but row write failed" guard: if
 * the DB update throws, the just-written object is removed so it can't orphan
 * (there is no GC sweep for persona icons, by design).
 */
export async function replacePersonaIcon(
  formId: string,
  bytes: Uint8Array,
): Promise<string> {
  const existing = await prisma.feedback_Form.findUnique({
    where: { id: formId },
    select: { personaIconKey: true },
  });
  if (!existing) throw new Error(`Feedback form not found: ${formId}`);

  const key = newPersonaIconKey(formId);
  const storage = getStorage();
  await storage.save(key, bytes, 'image/webp');

  try {
    await prisma.feedback_Form.update({
      where: { id: formId },
      data: { personaIconKey: key },
    });
  } catch (err) {
    await storage.delete(key).catch(() => {});
    throw err;
  }

  if (existing.personaIconKey) {
    await storage.delete(existing.personaIconKey).catch(() => {});
  }
  return key;
}

/** Drops a form's persona icon, reverting it to the default mascot art. */
export async function clearPersonaIcon(formId: string): Promise<void> {
  const existing = await prisma.feedback_Form.findUnique({
    where: { id: formId },
    select: { personaIconKey: true },
  });
  if (!existing?.personaIconKey) return;

  await prisma.feedback_Form.update({
    where: { id: formId },
    data: { personaIconKey: null },
  });
  await getStorage()
    .delete(existing.personaIconKey)
    .catch(() => {});
}

/**
 * Copies an existing icon object to a fresh key owned by another form, so a
 * duplicated form keeps the look without sharing a key (one form's delete would
 * otherwise break the other's icon). Best-effort: returns null if the source
 * object can't be read, leaving the copy iconless rather than failing the clone.
 */
export async function copyPersonaIcon(
  sourceKey: string,
  destFormId: string,
): Promise<string | null> {
  const storage = getStorage();
  try {
    const bytes = await storage.get(sourceKey);
    const key = newPersonaIconKey(destFormId);
    await storage.save(key, bytes, 'image/webp');
    return key;
  } catch {
    return null;
  }
}
