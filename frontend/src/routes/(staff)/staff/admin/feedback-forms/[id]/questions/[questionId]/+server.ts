import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { questionPatchSchema } from '$lib/validation/feedbackForms';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  requireAdmin,
  updateQuestion,
  deleteQuestion,
} from '$lib/server/feedbackFormsAdmin';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_FEEDBACK_FORM_WRITE, { locals });
  requireAdmin(locals);
  const parsed = questionPatchSchema.safeParse(await request.json());
  if (!parsed.success) throw error(400, parsed.error.issues[0]?.message);
  await updateQuestion(params.id, params.questionId, parsed.data);
  return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_FEEDBACK_FORM_WRITE, { locals });
  requireAdmin(locals);
  await deleteQuestion(params.id, params.questionId);
  return json({ success: true });
};
