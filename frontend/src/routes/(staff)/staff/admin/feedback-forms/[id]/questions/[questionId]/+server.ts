import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { questionPatchSchema } from '$lib/validation/feedbackForms';
import {
  requireAdmin,
  updateQuestion,
  deleteQuestion,
} from '$lib/server/feedbackFormsAdmin';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  requireAdmin(locals);
  const parsed = questionPatchSchema.safeParse(await request.json());
  if (!parsed.success) throw error(400, parsed.error.issues[0]?.message);
  await updateQuestion(params.id, params.questionId, parsed.data);
  return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  requireAdmin(locals);
  await deleteQuestion(params.id, params.questionId);
  return json({ success: true });
};
