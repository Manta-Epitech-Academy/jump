import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { questionSchema } from '$lib/validation/feedbackForms';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  requireAdmin,
  createQuestion,
  assertKeyAvailable,
} from '$lib/server/feedbackFormsAdmin';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_FEEDBACK_FORM_WRITE, { locals });
  requireAdmin(locals);
  const body = await request.json();
  const parsed = questionSchema.safeParse(body);
  if (!parsed.success) throw error(400, parsed.error.issues[0]?.message);

  // Reject a duplicate key up front for a clean message (the DB unique would
  // otherwise surface as an opaque 500).
  await assertKeyAvailable(params.id, parsed.data.key);

  const count = await prisma.feedback_Question.count({
    where: { formId: params.id },
  });
  // Optional insert position (the add-rail inserts after the active card);
  // absent → append. Shift the tail so the new row slots in cleanly.
  const wanted = z
    .number()
    .int()
    .min(0)
    .safeParse((body as { position?: unknown })?.position);
  const position = wanted.success ? Math.min(wanted.data, count) : count;
  if (position < count) {
    await prisma.feedback_Question.updateMany({
      where: { formId: params.id, position: { gte: position } },
      data: { position: { increment: 1 } },
    });
  }

  const created = await createQuestion(params.id, { ...parsed.data, position });
  return json(created);
};
