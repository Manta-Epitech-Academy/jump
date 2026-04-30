import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  resyncSubject,
  type ImportSubjectError,
} from '$lib/server/services/subjectImporter';
import { importErrorToHttpStatus } from '$lib/server/services/subjectImportErrors';

const bodySchema = z.object({
  ref: z.string().min(1).optional(),
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
  requireStaffGroup(locals, 'leads');

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw error(400, 'Body must be { ref?: string }');

  try {
    const result = await resyncSubject(
      params.subjectId,
      locals.staffProfile.id,
      parsed.data.ref,
    );
    return json(result);
  } catch (err) {
    if (err && typeof err === 'object' && 'kind' in err && 'message' in err) {
      const e = err as ImportSubjectError;
      throw error(importErrorToHttpStatus(e.kind), e.message);
    }
    console.error('[Subject resync] failed:', err);
    throw error(
      500,
      err instanceof Error ? err.message : 'Internal Server Error',
    );
  }
};
