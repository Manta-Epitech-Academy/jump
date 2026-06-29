import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { STAGE_FORM_SLUG } from '$lib/domain/feedback';

// The national stage dashboard moved into the form builder: per-form aggregate
// reporting now lives at /staff/admin/feedback-forms/[id]/responses (form-
// agnostic and includes public responses). This route is kept only to redirect
// old links to the stage form's responses.
export const load: PageServerLoad = async () => {
  const stage = await prisma.feedback_Form.findUnique({
    where: { slug: STAGE_FORM_SLUG },
    select: { id: true },
  });
  throw redirect(
    307,
    stage
      ? `/staff/admin/feedback-forms/${stage.id}/responses`
      : '/staff/admin/feedback-forms',
  );
};
