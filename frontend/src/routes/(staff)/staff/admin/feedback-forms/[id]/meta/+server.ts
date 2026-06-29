import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { formMetaPatchSchema } from '$lib/validation/feedbackForms';
import { requireAdmin, updateForm } from '$lib/server/feedbackFormsAdmin';

// Inline form-meta auto-save for the builder (title/intro/status/access flags).
// These are not structural, so they stay editable even once the form is locked.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const { staffId } = requireAdmin(locals);
  const parsed = formMetaPatchSchema.safeParse(await request.json());
  if (!parsed.success) throw error(400, parsed.error.issues[0]?.message);
  await updateForm(staffId, params.id, parsed.data);
  return json({ success: true });
};
