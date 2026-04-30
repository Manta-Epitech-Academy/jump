import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  importSubject,
  type ImportSubjectError,
} from '$lib/server/services/subjectImporter';
import { importErrorToHttpStatus } from '$lib/server/services/subjectImportErrors';

const bodySchema = z.object({
  repoUrl: z.string().min(1),
  ref: z.string().min(1).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  requireStaffGroup(locals, 'leads');

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw error(400, 'Body must be { repoUrl: string, ref?: string }');
  }

  try {
    const result = await importSubject({
      ...parsed.data,
      importedByStaffProfileId: locals.staffProfile.id,
    });
    return json(result);
  } catch (err) {
    if (err && typeof err === 'object' && 'kind' in err && 'message' in err) {
      const e = err as ImportSubjectError;
      throw error(importErrorToHttpStatus(e.kind), e.message);
    }
    console.error('[Subject import] failed:', err);
    throw error(
      500,
      err instanceof Error ? err.message : 'Internal Server Error',
    );
  }
};
