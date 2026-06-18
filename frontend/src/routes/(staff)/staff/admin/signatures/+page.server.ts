import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { uploadFile, deleteFile } from '$lib/server/infra/storage';

const BUCKET = 'jump-files';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

async function uploadSignature(
  file: File,
): Promise<{ key: string; contentType: string } | { error: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: 'Format invalide (PNG, JPEG ou WebP attendu).' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: "L'image dépasse la limite de 5 Mo." };
  }
  const key = `signatures/${crypto.randomUUID()}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadFile(BUCKET, key, buffer, file.type);
  return { key, contentType: file.type };
}

export const load: PageServerLoad = async () => {
  const [signatories, campuses] = await Promise.all([
    prisma.signatory.findMany({
      orderBy: [{ campusId: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        campusId: true,
        name: true,
        role: true,
        position: true,
      },
    }),
    prisma.campus.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return { signatories, campuses };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') {
      return fail(403, { message: 'Accès refusé.' });
    }

    const formData = await request.formData();
    const name = (formData.get('name') as string)?.trim();
    const role = (formData.get('role') as string)?.trim();
    const campusIdRaw = (formData.get('campusId') as string)?.trim();
    const campusId = campusIdRaw ? campusIdRaw : null;
    const position = Number(formData.get('position') ?? 0) || 0;
    const file = formData.get('file') as File | null;

    if (!name || !role) {
      return fail(400, { message: 'Nom et fonction sont requis.' });
    }
    if (!file || file.size === 0) {
      return fail(400, { message: 'Une image de signature est requise.' });
    }

    const uploaded = await uploadSignature(file);
    if ('error' in uploaded) return fail(400, { message: uploaded.error });

    try {
      await prisma.signatory.create({
        data: {
          campusId,
          name,
          role,
          position,
          signatureKey: uploaded.key,
          contentType: uploaded.contentType,
        },
      });
      return { success: true };
    } catch (err) {
      console.error('Signatory create failed:', err);
      // Undo the S3 upload so a failed insert never leaves an orphan object.
      await deleteFile(BUCKET, uploaded.key).catch(() => {});
      return fail(500, { message: 'Erreur lors de la création.' });
    }
  },

  update: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') {
      return fail(403, { message: 'Accès refusé.' });
    }

    const formData = await request.formData();
    const id = (formData.get('id') as string)?.trim();
    const name = (formData.get('name') as string)?.trim();
    const role = (formData.get('role') as string)?.trim();
    const campusIdRaw = (formData.get('campusId') as string)?.trim();
    const campusId = campusIdRaw ? campusIdRaw : null;
    const position = Number(formData.get('position') ?? 0) || 0;
    const file = formData.get('file') as File | null;

    if (!id || !name || !role) {
      return fail(400, { message: 'Champs manquants.' });
    }

    const existing = await prisma.signatory.findUnique({ where: { id } });
    if (!existing) return fail(404, { message: 'Signataire introuvable.' });

    let newKey: string | null = null;
    let newContentType: string | null = null;
    if (file && file.size > 0) {
      const uploaded = await uploadSignature(file);
      if ('error' in uploaded) return fail(400, { message: uploaded.error });
      newKey = uploaded.key;
      newContentType = uploaded.contentType;
    }

    try {
      await prisma.signatory.update({
        where: { id },
        data: {
          campusId,
          name,
          role,
          position,
          ...(newKey && newContentType
            ? { signatureKey: newKey, contentType: newContentType }
            : {}),
        },
      });
      // Drop the previous image only after the row points at the new one.
      if (newKey)
        await deleteFile(BUCKET, existing.signatureKey).catch(() => {});
      return { success: true };
    } catch (err) {
      console.error('Signatory update failed:', err);
      if (newKey) await deleteFile(BUCKET, newKey).catch(() => {});
      return fail(500, { message: 'Erreur lors de la mise à jour.' });
    }
  },

  delete: async ({ url, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') {
      return fail(403, { message: 'Accès refusé.' });
    }

    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      const signatory = await prisma.signatory.findUnique({ where: { id } });
      if (!signatory) return fail(404, { message: 'Signataire introuvable.' });

      await prisma.signatory.delete({ where: { id } });
      await deleteFile(BUCKET, signatory.signatureKey).catch(() => {});
      return { success: true };
    } catch (err) {
      console.error('Signatory delete failed:', err);
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },
};
