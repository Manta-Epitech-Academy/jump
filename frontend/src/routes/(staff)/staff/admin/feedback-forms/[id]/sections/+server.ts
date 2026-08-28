import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { sectionSchema } from '$lib/validation/feedbackForms';
import { requireAdmin, createSection } from '$lib/server/feedbackFormsAdmin';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_FEEDBACK_FORM_WRITE, { locals });
  requireAdmin(locals);
  const parsed = sectionSchema.safeParse(await request.json());
  if (!parsed.success) throw error(400, parsed.error.issues[0]?.message);
  const position = await prisma.feedback_Section.count({
    where: { formId: params.id },
  });
  const created = await createSection(params.id, { ...parsed.data, position });
  return json(created);
};
