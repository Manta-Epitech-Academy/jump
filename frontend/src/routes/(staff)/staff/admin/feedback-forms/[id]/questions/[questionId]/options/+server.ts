import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { optionSchema } from '$lib/validation/feedbackForms';
import { requireAdmin, createOption } from '$lib/server/feedbackFormsAdmin';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_FEEDBACK_FORM_WRITE, { locals });
  requireAdmin(locals);
  const parsed = optionSchema.safeParse(await request.json());
  if (!parsed.success) throw error(400, parsed.error.issues[0]?.message);
  const position = await prisma.feedback_QuestionOption.count({
    where: { questionId: params.questionId },
  });
  const created = await createOption(params.id, params.questionId, {
    ...parsed.data,
    position,
  });
  return json(created);
};
