import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  requireAdmin,
  duplicateQuestion,
} from '$lib/server/feedbackFormsAdmin';

// Clones one question (+ options) right after the source. Returns the new
// question in the same shape the editor `load` projects, so the client can
// splice it into its local state without a full refetch.
export const POST: RequestHandler = async ({ params, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_FEEDBACK_FORM_WRITE, { locals });
  requireAdmin(locals);
  const { id } = await duplicateQuestion(params.id, params.questionId);

  const q = await prisma.feedback_Question.findUniqueOrThrow({
    where: { id },
    include: { options: { orderBy: { position: 'asc' } } },
  });

  return json({
    id: q.id,
    key: q.key,
    position: q.position,
    sectionId: q.sectionId,
    prompt: q.prompt,
    type: q.type,
    required: q.required,
    identityField: q.identityField,
    inputKind: q.inputKind,
    minSelections: q.minSelections,
    maxSelections: q.maxSelections,
    placeholder: q.placeholder,
    options: q.options.map((o) => ({
      id: o.id,
      label: o.label,
      kind: o.kind,
      position: o.position,
      reaction: o.reaction,
    })),
  });
};
