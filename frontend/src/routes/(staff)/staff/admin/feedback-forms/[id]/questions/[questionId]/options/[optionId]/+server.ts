import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { optionPatchSchema } from '$lib/validation/feedbackForms';
import {
  requireAdmin,
  updateOption,
  deleteOption,
} from '$lib/server/feedbackFormsAdmin';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  requireAdmin(locals);
  const parsed = optionPatchSchema.safeParse(await request.json());
  if (!parsed.success) throw error(400, parsed.error.issues[0]?.message);
  await updateOption(params.id, params.optionId, parsed.data);
  return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  requireAdmin(locals);
  await deleteOption(params.id, params.optionId);
  return json({ success: true });
};
