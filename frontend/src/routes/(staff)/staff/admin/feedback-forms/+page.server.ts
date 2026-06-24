import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { formCreateSchema } from '$lib/validation/feedbackForms';
import {
  requireAdmin,
  createForm,
  duplicateForm,
  deleteForm,
} from '$lib/server/feedbackFormsAdmin';

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

export const load: PageServerLoad = async () => {
  const createFormForm = await superValidate(zod4(formCreateSchema));

  const cohort: Promise<FormsCohort> = (async () => {
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

  return { createFormForm, cohort };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const { staffId } = requireAdmin(locals);
    const form = await superValidate(request, zod4(formCreateSchema));
    if (!form.valid) return fail(400, { form });
    const { id } = await createForm(staffId, form.data);
    throw redirect(303, `/staff/admin/feedback-forms/${id}`);
  },

  duplicate: async ({ request, locals }) => {
    const { staffId } = requireAdmin(locals);
    const data = await request.formData();
    const id = data.get('id');
    if (typeof id !== 'string') return fail(400, { message: 'id manquant' });
    const { id: newId } = await duplicateForm(staffId, id);
    throw redirect(303, `/staff/admin/feedback-forms/${newId}`);
  },

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
