import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { prisma } from '$lib/server/db';
import { assertStudentOwns } from '$lib/server/db/assert';
import { getCached, setCached } from '$lib/server/infra/contentCache';
import {
  ProgressService,
  ValidationError,
  type ActivityStructure,
} from '$lib/server/services/progressService';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  try {
    // Cache with prefix to avoid collision with progressService cache
    const cacheKey = `activity-load:${params.activityId}`;
    let activityWithSlot = getCached<any>(cacheKey);
    if (!activityWithSlot) {
      activityWithSlot = await prisma.activity.findUnique({
        where: { id: params.activityId },
        include: {
          timeSlot: {
            include: {
              planning: { select: { eventId: true } },
            },
          },
        },
      });
      if (!activityWithSlot) throw error(404, 'Activité introuvable');
      setCached(cacheKey, activityWithSlot);
    }

    const activity = activityWithSlot;
    const eventId = activityWithSlot.timeSlot?.planning?.eventId;
    if (!eventId) {
      throw error(404, 'Activité non rattachée à un événement.');
    }

    // Check student has a participation for this event
    const participation = await prisma.participation.findFirst({
      where: {
        talentId: locals.talent.id,
        eventId,
      },
      include: { event: true },
    });

    if (!participation) {
      throw error(403, 'Tu ne participes pas à cet événement.');
    }

    // Static activities: return early with markdown content, no steps/progress
    if (!activity.isDynamic) {
      return {
        activity,
        content: null,
        progress: null,
        eventId,
        participation,
        portfolioItems: [],
      };
    }

    // Dynamic activities: full steps flow
    const content = activity.contentStructure as ActivityStructure | null;

    if (!content || !content.steps || content.steps.length === 0) {
      throw new Error('Cette activité ne contient aucune étape configurée.');
    }

    let progress = await prisma.stepsProgress.findFirst({
      where: {
        talentId: locals.talent.id,
        activityId: activity.id,
        eventId,
      },
    });

    if (!progress) {
      const firstStepId = content.steps[0].id;
      progress = await prisma.stepsProgress.create({
        data: {
          talentId: locals.talent.id,
          activityId: activity.id,
          eventId,
          currentStepId: firstStepId,
          unlockedStepId: firstStepId,
          status: 'active',
        },
      });
    }

    const portfolioItems = await prisma.portfolioItem.findMany({
      where: {
        talentId: locals.talent.id,
        eventId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      activity,
      content,
      progress,
      eventId,
      participation,
      portfolioItems,
    };
  } catch (err: any) {
    if (!err.status) console.error('Activity cockpit load error:', err);
    throw error(
      err.status || 500,
      err.message || "Erreur lors du chargement de l'activité",
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
        locals.talent!.id,
        params.activityId,
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
      await assertStudentOwns(locals.talent!.id, progressId, 'stepsProgress');
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
      await assertStudentOwns(locals.talent!.id, progressId, 'stepsProgress');
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
    if (!locals.talent) return fail(401, { message: 'Non autorisé' });

    const data = await request.formData();
    const file = data.get('file') as File;
    const url = data.get('url') as string;

    if ((!file || file.size === 0) && !url) {
      return fail(400, { message: 'Tu dois fournir une image ou un lien.' });
    }

    try {
      await prisma.portfolioItem.create({
        data: {
          talentId: locals.talent.id,
          eventId: data.get('eventId') as string,
          caption: (data.get('caption') as string) || undefined,
          url: url || undefined,
        },
      });
      return { success: true };
    } catch (err) {
      console.error('Portfolio add error:', err);
      return fail(500, { message: "Erreur lors de l'ajout au portfolio." });
    }
  },

  deletePortfolioItem: async ({ request, locals }) => {
    if (!locals.talent) return fail(401, { message: 'Non autorisé' });

    const data = await request.formData();
    const itemId = data.get('itemId') as string;

    try {
      await assertStudentOwns(locals.talent!.id, itemId, 'portfolioItem');
      await prisma.portfolioItem.delete({ where: { id: itemId } });
      return { success: true };
    } catch (err) {
      console.error('Portfolio delete error:', err);
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },

  submitFeedback: async ({ request, locals }) => {
    if (!locals.talent) return fail(401, { message: 'Non autorisé' });

    const data = await request.formData();
    const participationId = data.get('participationId') as string;
    const ratingStr = data.get('rating') as string;
    const feedback = data.get('feedback') as string;

    const rating = parseInt(ratingStr, 10);
    if (!participationId || ![1, 2, 3].includes(rating))
      return fail(400, { message: 'Données invalides' });

    try {
      await assertStudentOwns(
        locals.talent!.id,
        participationId,
        'participation',
      );
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
