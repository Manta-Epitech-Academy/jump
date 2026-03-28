import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getCachedSubject, setCachedSubject } from '$lib/server/subjectCache';
import {
  ProgressService,
  ValidationError,
  type SubjectStructure,
} from '$lib/server/progressService';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.student) throw error(401, 'Non autorisé');

  try {
    let subject = getCachedSubject<any>(params.subjectId);
    if (!subject) {
      subject = await locals.studentPb
        .collection('subjects')
        .getOne(params.subjectId);
      setCachedSubject(params.subjectId, subject);
    }
    const content = subject.content_structure as SubjectStructure | null;

    if (!content || !content.steps || content.steps.length === 0) {
      throw new Error('Ce sujet ne contient aucune étape configurée.');
    }

    const participations = await locals.studentPb
      .collection('participations')
      .getFullList({
        filter: `student = "${locals.student.id}" && subjects ~ "${subject.id}"`,
        sort: '-created',
      });

    if (participations.length === 0) {
      throw error(403, "Tu n'es pas assigné à ce sujet.");
    }
    const eventId = participations[0].event;

    let progress;
    try {
      progress = await locals.studentPb
        .collection('steps_progress')
        .getFirstListItem(
          `student="${locals.student.id}" && subject="${subject.id}" && event="${eventId}"`,
        );
    } catch (e) {
      const firstStepId = content.steps[0].id;
      progress = await locals.studentPb.collection('steps_progress').create({
        student: locals.student.id,
        subject: subject.id,
        event: eventId,
        current_step_id: firstStepId,
        unlocked_step_id: firstStepId,
        status: 'active',
      });
    }

    const portfolioItems = await locals.studentPb
      .collection('portfolio_items')
      .getFullList({
        filter: `student = "${locals.student.id}" && event = "${eventId}"`,
        sort: '-created',
      });

    return {
      subject,
      content,
      progress,
      eventId,
      portfolioItems,
    };
  } catch (err: any) {
    if (!err.status) console.error('Subject cockpit load error:', err);
    throw error(
      err.status || 500,
      err.message || 'Erreur lors du chargement du sujet',
    );
  }
};

export const actions: Actions = {
  validateStep: async ({ request, locals, params }) => {
    const data = await request.formData();
    const stepId = data.get('stepId') as string;
    const progressId = data.get('progressId') as string;
    const answerIndexStr = data.get('answerIndex') as string | null;
    const pinInput = data.get('pin') as string | null;

    try {
      await ProgressService.validateStep(
        locals.studentPb,
        locals.systemPb,
        locals.student!.id,
        params.subjectId,
        stepId,
        progressId,
        answerIndexStr,
        pinInput,
      );
      return { success: true };
    } catch (err) {
      if (err instanceof ValidationError) {
        return fail(400, { incorrect: true, message: err.message });
      }
      console.error('Step validation error:', err);
      return fail(500, { message: 'Erreur serveur lors de la validation.' });
    }
  },

  changeStep: async ({ request, locals }) => {
    const data = await request.formData();
    try {
      await locals.studentPb
        .collection('steps_progress')
        .update(data.get('progressId') as string, {
          current_step_id: data.get('stepId') as string,
        });
      return { success: true };
    } catch (err) {
      return fail(500, { message: 'Erreur de navigation' });
    }
  },

  toggleHelp: async ({ request, locals }) => {
    const data = await request.formData();
    const currentStatus = data.get('currentStatus') as string;

    try {
      const newStatus =
        currentStatus === 'needs_help' ? 'active' : 'needs_help';
      await locals.studentPb
        .collection('steps_progress')
        .update(data.get('progressId') as string, {
          status: newStatus,
        });
      return { success: true, status: newStatus };
    } catch (err) {
      return fail(500, { message: 'Erreur lors de la notification du Manta.' });
    }
  },

  addPortfolioItem: async ({ request, locals }) => {
    if (!locals.student) return fail(401, { message: 'Non autorisé' });

    const data = await request.formData();
    const file = data.get('file') as File;
    const url = data.get('url') as string;

    if ((!file || file.size === 0) && !url) {
      return fail(400, { message: 'Tu dois fournir une image ou un lien.' });
    }

    try {
      const formData = new FormData();
      formData.append('student', locals.student.id);
      formData.append('event', data.get('eventId') as string);
      if (data.get('caption'))
        formData.append('caption', data.get('caption') as string);
      if (url) formData.append('url', url);
      if (file && file.size > 0) formData.append('file', file);

      await locals.studentPb.collection('portfolio_items').create(formData);
      return { success: true };
    } catch (err) {
      console.error('Portfolio add error:', err);
      return fail(500, { message: "Erreur lors de l'ajout au portfolio." });
    }
  },

  deletePortfolioItem: async ({ request, locals }) => {
    if (!locals.student) return fail(401, { message: 'Non autorisé' });

    const data = await request.formData();
    const itemId = data.get('itemId') as string;

    try {
      // PocketBase API rules ensure a student can only delete their own items,
      // but we enforce the delete via the scoped studentPb token directly.
      await locals.studentPb.collection('portfolio_items').delete(itemId);
      return { success: true };
    } catch (err) {
      console.error('Portfolio delete error:', err);
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },
};
