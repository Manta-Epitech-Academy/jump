import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { getStorage } from '$lib/server/infra/storage';
import {
  processCmsImage,
  CMS_IMAGE_INPUT_TYPES,
  CMS_IMAGE_MAX_UPLOAD_BYTES,
} from '$lib/server/cms/image';

// Upload an image for embedding in CMS content (the welcome message).
// Bytes are downscaled + re-encoded to WebP, stored in S3, and a CmsImage row
// records the metadata. The editor then references the image via the proxy URL
// returned here (`/api/cms/images/<id>`). Gated to staff: only staff reach a
// welcome editor, and the content only goes live behind the lead-gated save.

export const POST: RequestHandler = async ({ request, locals }) => {
  const staffProfile = locals.staffProfile;
  if (!staffProfile) throw error(403, 'Accès refusé.');

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return json({ message: 'Aucune image sélectionnée.' }, { status: 400 });
  }
  if (!CMS_IMAGE_INPUT_TYPES.includes(file.type as never)) {
    return json(
      { message: 'Format non supporté (JPEG, PNG ou WebP attendu).' },
      { status: 415 },
    );
  }
  if (file.size > CMS_IMAGE_MAX_UPLOAD_BYTES) {
    return json(
      { message: "L'image dépasse la limite de 10 Mo." },
      { status: 413 },
    );
  }

  try {
    const processed = await processCmsImage(
      new Uint8Array(await file.arrayBuffer()),
    );
    const s3Key = `cms/${crypto.randomUUID()}.webp`;
    const storage = getStorage();
    await storage.save(s3Key, processed.bytes);

    let row;
    try {
      row = await prisma.cmsImage.create({
        data: {
          s3Key,
          contentType: processed.contentType,
          width: processed.width,
          height: processed.height,
          size: processed.bytes.byteLength,
          uploadedById: staffProfile.id,
        },
      });
    } catch (err) {
      // The object landed in S3 but the row failed: with no row, the GC sweep
      // (which works off rows) could never reclaim it, so undo the upload now.
      await storage.delete(s3Key).catch(() => {});
      throw err;
    }

    return json({
      id: row.id,
      url: `/api/cms/images/${row.id}`,
      width: row.width,
      height: row.height,
    });
  } catch (err) {
    console.error('[cms/images] upload failed', err);
    // Bun.Image refuses an over-large canvas (see `maxPixels` in cms/image.ts)
    // with a stable code; report it as a clear 413 rather than a generic 500.
    if ((err as { code?: string })?.code === 'ERR_IMAGE_TOO_MANY_PIXELS') {
      return json(
        { message: "L'image a une résolution trop élevée." },
        { status: 413 },
      );
    }
    return json(
      { message: "Échec du traitement de l'image." },
      { status: 500 },
    );
  }
};
