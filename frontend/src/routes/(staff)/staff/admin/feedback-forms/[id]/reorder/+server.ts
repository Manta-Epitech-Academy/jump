import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { reorderSchema } from '$lib/validation/feedbackForms';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  requireAdmin,
  reorderSections,
  reorderQuestions,
  reorderOptions,
} from '$lib/server/feedbackFormsAdmin';

const bodySchema = reorderSchema.extend({
  target: z.enum(['sections', 'questions', 'options']),
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_FEEDBACK_FORM_WRITE, { locals });
  requireAdmin(locals);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) throw error(400, parsed.error.issues[0]?.message);

  const { target, ids } = parsed.data;
  if (target === 'sections') await reorderSections(params.id, ids);
  else if (target === 'questions') await reorderQuestions(params.id, ids);
  else await reorderOptions(params.id, ids);

  return json({ success: true });
};
