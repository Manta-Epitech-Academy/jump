import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { optionSchema } from '$lib/validation/feedbackForms';
import { requireAdmin, createOption } from '$lib/server/feedbackFormsAdmin';

export const POST: RequestHandler = async ({ params, request, locals }) => {
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
