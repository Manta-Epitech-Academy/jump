import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

// The national stage dashboard moved into the form builder: per-form aggregate
// reporting now lives at /staff/admin/feedback-forms/[id]/responses (form-
// agnostic, includes public responses). Feedback is no longer one privileged
// "stage" form, so this old link just lands on the forms hub.
export const load: PageServerLoad = async () => {
  throw redirect(307, '/staff/admin/feedback-forms');
};
