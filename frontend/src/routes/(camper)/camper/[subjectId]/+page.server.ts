import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { prisma } from '$lib/server/db';
import { assertStudentOwns } from '$lib/server/db/assert';
import {
  getCachedSubject,
  setCachedSubject,
} from '$lib/server/infra/subjectCache';
import {
  ProgressService,
  ValidationError,
  type SubjectStructure,
} from '$lib/server/services/progressService';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.studentProfile) throw error(401, 'Non autorisé');

  try {
    let subject = getCachedSubject<any>(params.subjectId);
    if (!subject) {
      subject = await prisma.subject.findUnique({
        where: { id: params.subjectId },
      });
      if (!subject) throw error(404, 'Sujet introuvable');
      setCachedSubject(params.subjectId, subject);
    }
    const content = subject.contentStructure as SubjectStructure | null;

    if (!content || !content.steps || content.steps.length === 0) {
      throw new Error('Ce sujet ne contient aucune étape configurée.');
    }

    const participation = await prisma.participation.findFirst({
      where: {
        studentProfileId: locals.studentProfile.id,
        subjects: { some: { subjectId: subject.id } },
      },
      include: {
        event: true,
        subjects: { include: { subject: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!participation) {
      throw error(403, "Tu n'es pas assigné à ce sujet.");
    }
    const eventId = participation.eventId;

    let progress = await prisma.stepsProgress.findFirst({
      where: {
        studentProfileId: locals.studentProfile.id,
        subjectId: subject.id,
        eventId,
      },
    });

    if (!progress) {
      const firstStepId = content.steps[0].id;
      progress = await prisma.stepsProgress.create({
        data: {
          studentProfileId: locals.studentProfile.id,
          subjectId: subject.id,
          eventId,
          currentStepId: firstStepId,
          unlockedStepId: firstStepId,
          status: 'active',
        },
      });
    }

    const portfolioItems = await prisma.portfolioItem.findMany({
      where: {
        studentProfileId: locals.studentProfile.id,
        eventId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      subject,
      content,
      progress,
      eventId,
      participation,
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
        locals.studentProfile!.id,
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
      const progressId = data.get('progressId') as string;
      await assertStudentOwns(locals.studentProfile!.id, progressId, 'stepsProgress');
      await prisma.stepsProgress.update({
        where: { id: progressId },
        data: { currentStepId: data.get('stepId') as string },
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
      const progressId = data.get('progressId') as string;
      await assertStudentOwns(locals.studentProfile!.id, progressId, 'stepsProgress');
      const newStatus =
        currentStatus === 'needs_help' ? 'active' : 'needs_help';
      await prisma.stepsProgress.update({
        where: { id: progressId },
        data: { status: newStatus },
      });
      return { success: true, status: newStatus };
    } catch (err) {
      return fail(500, { message: 'Erreur lors de la notification du Manta.' });
    }
  },

  addPortfolioItem: async ({ request, locals }) => {
    if (!locals.studentProfile) return fail(401, { message: 'Non autorisé' });

    const data = await request.formData();
    const file = data.get('file') as File;
    const url = data.get('url') as string;

    if ((!file || file.size === 0) && !url) {
      return fail(400, { message: 'Tu dois fournir une image ou un lien.' });
    }

    try {
      await prisma.portfolioItem.create({
        data: {
          studentProfileId: locals.studentProfile.id,
          eventId: data.get('eventId') as string,
          caption: (data.get('caption') as string) || undefined,
          url: url || undefined,
          // NOTE: File upload handling may need a separate storage solution
          // since Prisma does not handle file blobs like PocketBase did.
          // For now, only the URL path is stored.
        },
      });
      return { success: true };
    } catch (err) {
      console.error('Portfolio add error:', err);
      return fail(500, { message: "Erreur lors de l'ajout au portfolio." });
    }
  },

  deletePortfolioItem: async ({ request, locals }) => {
    if (!locals.studentProfile) return fail(401, { message: 'Non autorisé' });

    const data = await request.formData();
    const itemId = data.get('itemId') as string;

    try {
      await assertStudentOwns(locals.studentProfile!.id, itemId, 'portfolioItem');
      await prisma.portfolioItem.delete({ where: { id: itemId } });
      return { success: true };
    } catch (err) {
      console.error('Portfolio delete error:', err);
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },

  submitFeedback: async ({ request, locals }) => {
    if (!locals.studentProfile) return fail(401, { message: 'Non autorisé' });

    const data = await request.formData();
    const participationId = data.get('participationId') as string;
    const ratingStr = data.get('rating') as string;
    const feedback = data.get('feedback') as string;

    const rating = parseInt(ratingStr, 10);
    if (!participationId || ![1, 2, 3].includes(rating))
      return fail(400, { message: 'Données invalides' });

    try {
      await assertStudentOwns(locals.studentProfile!.id, participationId, 'participation');
      await prisma.participation.update({
        where: { id: participationId },
        data: {
          camperRating: rating,
          camperFeedback: feedback,
        },
      });
      return { success: true };
    } catch (err) {
      console.error('Erreur soumission feedback:', err);
      return fail(500, { message: "Erreur lors de l'envoi du feedback" });
    }
  },
};
