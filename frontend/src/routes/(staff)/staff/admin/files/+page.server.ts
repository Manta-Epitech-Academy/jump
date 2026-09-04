import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  uploadFile,
  deleteFile,
  getSignedDownloadUrl,
} from '$lib/server/infra/storage';

const BUCKET = 'jump-files';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const load: PageServerLoad = async ({ locals }) => {
  const files = await prisma.adminFile.findMany({
    orderBy: { createdAt: 'desc' },
    include: { uploadedBy: { include: { user: true } } },
  });

  return { files };
};

export const actions: Actions = {
  upload: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_FILE_UPLOAD, { locals });
    const staffProfile = locals.staffProfile;
    if (!staffProfile) return fail(403, { message: 'Accès refusé.' });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || file.size === 0) {
      return fail(400, { message: 'Aucun fichier sélectionné.' });
    }
    if (file.size > MAX_FILE_SIZE) {
      return fail(400, { message: 'Le fichier dépasse la limite de 50 Mo.' });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
    const s3Key = `admin/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    try {
      await uploadFile(BUCKET, s3Key, buffer, file.type);
      await prisma.adminFile.create({
        data: {
          name: file.name,
          s3Key,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          uploadedById: staffProfile.id,
        },
      });
      return { success: true };
    } catch (err) {
      console.error('Upload failed:', err);
      return fail(500, { message: "Erreur lors de l'upload." });
    }
  },

  delete: async ({ url, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_FILE_DELETE, { locals });
    const staffProfile = locals.staffProfile;
    if (!staffProfile) return fail(403, { message: 'Accès refusé.' });

    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      const file = await prisma.adminFile.findUnique({ where: { id } });
      if (!file) return fail(404, { message: 'Fichier introuvable.' });

      await deleteFile(BUCKET, file.s3Key);
      await prisma.adminFile.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      console.error('Delete failed:', err);
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },

  download: async ({ url, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_FILE_DOWNLOAD, { locals });
    if (!locals.staffProfile) return fail(403, { message: 'Acces refuse.' });
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    const file = await prisma.adminFile.findUnique({ where: { id } });
    if (!file) return fail(404, { message: 'Fichier introuvable.' });

    try {
      const signedUrl = await getSignedDownloadUrl(BUCKET, file.s3Key);
      return { signedUrl, fileName: file.name };
    } catch (err) {
      console.error('Signed URL failed:', err);
      return fail(500, {
        message: 'Erreur lors de la génération du lien.',
      });
    }
  },
};
