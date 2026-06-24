import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { getStorage } from '$lib/server/infra/storage';
import { requireAdmin } from '$lib/server/feedbackFormsAdmin';
import {
  processPersonaIcon,
  replacePersonaIcon,
  clearPersonaIcon,
  PERSONA_ICON_INPUT_TYPES,
  PERSONA_ICON_MAX_UPLOAD_BYTES,
} from '$lib/server/feedbackForms/personaIcon';

// Persona avatar for a feedback form. POST/DELETE are admin-only (mutate the
// form). GET is intentionally PUBLIC: the icon is non-sensitive staff-chosen art
// and the unauthenticated /bilan respondent must see it. The served URL carries
// ?v=<key>, so a replacement is a new URL and the short cache never goes stale.

export const POST: RequestHandler = async ({ params, request, locals }) => {
  requireAdmin(locals);

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return json({ message: 'Aucune image sélectionnée.' }, { status: 400 });
  }
  if (!PERSONA_ICON_INPUT_TYPES.includes(file.type as never)) {
    return json(
      { message: 'Format non supporté (JPEG, PNG ou WebP attendu).' },
      { status: 415 },
    );
  }
  if (file.size > PERSONA_ICON_MAX_UPLOAD_BYTES) {
    return json(
      { message: "L'image dépasse la limite de 2 Mo." },
      {
        status: 413,
      },
    );
  }

  try {
    const processed = await processPersonaIcon(
      new Uint8Array(await file.arrayBuffer()),
    );
    const key = await replacePersonaIcon(params.id, processed.bytes);
    return json({
      key,
      url: `/api/feedback-forms/${params.id}/persona-icon?v=${key}`,
    });
  } catch (err) {
    console.error('[feedback persona-icon] upload failed', err);
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

export const DELETE: RequestHandler = async ({ params, locals }) => {
  requireAdmin(locals);
  await clearPersonaIcon(params.id);
  return json({ ok: true });
};

export const GET: RequestHandler = async ({ params }) => {
  const form = await prisma.feedback_Form.findUnique({
    where: { id: params.id },
    select: { personaIconKey: true },
  });
  if (!form?.personaIconKey) throw error(404);

  let buffer: Buffer;
  try {
    buffer = await getStorage().get(form.personaIconKey);
  } catch {
    throw error(404);
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
