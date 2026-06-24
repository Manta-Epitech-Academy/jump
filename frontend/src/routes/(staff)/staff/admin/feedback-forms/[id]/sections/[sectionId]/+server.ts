import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sectionSchema } from '$lib/validation/feedbackForms';
import {
  requireAdmin,
  updateSection,
  deleteSection,
} from '$lib/server/feedbackFormsAdmin';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  requireAdmin(locals);
  const parsed = sectionSchema.partial().safeParse(await request.json());
  if (!parsed.success) throw error(400, parsed.error.issues[0]?.message);
  await updateSection(params.id, params.sectionId, parsed.data);
  return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  requireAdmin(locals);
  await deleteSection(params.id, params.sectionId);
  return json({ success: true });
};
