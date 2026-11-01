import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { requireAdmin, deleteForm } from '$lib/server/feedbackFormsAdmin';

export interface FormListRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  allowsPublicAccess: boolean;
  allowsAuthenticatedAccess: boolean;
  questionCount: number;
  submissionCount: number;
  updatedAt: string;
}

export interface FormsCohort {
  rows: FormListRow[];
}

// The catalogue of forms, each opening on its preview and its responses. A form
// is written over the admin API (`write_feedback_form`, `write_feedback_form_copy`,
// its status included); deleting one stays here, since a delete a model could
// aim on its own is never an operation (#483).
export const load: PageServerLoad = async () => {
  const cohort: Promise<FormsCohort> = (async () => {
    // Every form. An event-specific one is just a normally-named form here,
    // recognised by its title.
    const forms = await prisma.feedback_Form.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        allowsPublicAccess: true,
        allowsAuthenticatedAccess: true,
        updatedAt: true,
        _count: { select: { questions: true, submissions: true } },
      },
    });
    return {
      rows: forms.map((f) => ({
        id: f.id,
        slug: f.slug,
        title: f.title,
        status: f.status,
        allowsPublicAccess: f.allowsPublicAccess,
        allowsAuthenticatedAccess: f.allowsAuthenticatedAccess,
        questionCount: f._count.questions,
        submissionCount: f._count.submissions,
        updatedAt: f.updatedAt.toISOString(),
      })),
    };
  })();

  return { cohort };
};

export const actions: Actions = {
  delete: async ({ url, locals }) => {
    requireAdmin(locals);
    // id arrives as an action query param (?/delete&id=…) because the shared
    // ConfirmDeleteDialog renders no hidden field.
    const id = url.searchParams.get('id');
    if (!id) return fail(400, { message: 'id manquant' });
    await deleteForm(id);
    return { success: true };
  },
};
