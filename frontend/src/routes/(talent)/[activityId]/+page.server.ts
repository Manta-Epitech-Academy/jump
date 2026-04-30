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
import { markSectionSeen } from '$lib/server/services/observableTracker';

type GithubStep = {
  id: string;
  title: string;
  content_html: string;
  type: 'theory';
};

type GithubContent = {
  source: 'github';
  steps: GithubStep[];
};

/**
 * Build the per-H1 paginated view of a GitHub-backed subject version.
 * Each level-1 Section is one step; its `htmlSlice` is computed at import
 * time so this loader is just an ordered SELECT.
 */
async function loadGithubSubjectContent(
  subjectVersionId: string,
): Promise<GithubContent> {
  const cacheKey = `github-subject:${subjectVersionId}`;
  const cached = getCached<GithubContent>(cacheKey);
  if (cached) return cached;

  const sections = await prisma.section.findMany({
    where: { subjectVersionId, level: 1 },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, title: true, htmlSlice: true },
  });

  const content: GithubContent = {
    source: 'github',
    steps: sections.map((s) => ({
      id: s.id,
      title: s.title,
      content_html: s.htmlSlice ?? '',
      type: 'theory',
    })),
  };
  setCached(cacheKey, content);
  return content;
}

/**
 * Advance the talent's progress on a GitHub-backed activity.
 * Sets `unlockedStepId` to the next H1 section in document order, or
 * `'COMPLETED'` if the current section is the last one. Also bumps
 * `currentStepId` to the same target so the talent lands on the next page.
 *
 * Per-section observable tracking is wired up in step 7 (observableTracker).
 */
async function advanceGithubStep(params: {
  talentId: string;
  activityId: string;
  subjectVersionId: string;
  eventId: string;
  progressId: string;
  stepId: string;
}): Promise<void> {
  await assertStudentOwns(params.talentId, params.progressId, 'stepsProgress');

  const sections = await prisma.section.findMany({
    where: { subjectVersionId: params.subjectVersionId, level: 1 },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });
  const idx = sections.findIndex((s) => s.id === params.stepId);
  if (idx < 0) {
    throw new ValidationError('Étape inconnue dans ce sujet.');
  }
  const nextStepId =
    idx + 1 < sections.length ? sections[idx + 1].id : 'COMPLETED';

  // Commit observables for the section being left BEFORE advancing the
  // progress pointer. If marking fails, the talent stays on the same step
  // instead of ending up advanced with no observable rows.
  await markSectionSeen({
    talentId: params.talentId,
    eventId: params.eventId,
    sectionId: params.stepId,
  });

  await prisma.stepsProgress.update({
    where: { id: params.progressId },
    data: {
      unlockedStepId: nextStepId,
      currentStepId: nextStepId === 'COMPLETED' ? params.stepId : nextStepId,
      status: nextStepId === 'COMPLETED' ? 'completed' : 'active',
      lastUnlockSource: 'student',
    },
  });
}

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

    // Block access before the slot has actually started.
    if (
      activityWithSlot.timeSlot?.startTime &&
      new Date(activityWithSlot.timeSlot.startTime).getTime() > Date.now()
    ) {
      throw error(403, "Cette activité n'a pas encore commencé.");
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

    // Dynamic activities: GitHub-backed binding takes precedence; otherwise
    // fall through to the inline JSON `contentStructure` source. Both are
    // first-class and keep working in parallel.
    let content: ActivityStructure | GithubContent | null = null;
    if (activity.subjectVersionId) {
      content = await loadGithubSubjectContent(activity.subjectVersionId);
    } else {
      content = activity.contentStructure as ActivityStructure | null;
    }

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
      const activity = await prisma.activity.findUnique({
        where: { id: params.activityId },
        select: {
          id: true,
          subjectVersionId: true,
          timeSlot: { select: { planning: { select: { eventId: true } } } },
        },
      });
      if (!activity) return fail(404, { message: 'Activité introuvable.' });

      if (activity.subjectVersionId) {
        const eventId = activity.timeSlot?.planning?.eventId;
        if (!eventId) {
          return fail(400, {
            message: 'Événement introuvable pour cette activité.',
          });
        }
        await advanceGithubStep({
          talentId: locals.talent!.id,
          activityId: activity.id,
          subjectVersionId: activity.subjectVersionId,
          eventId,
          progressId,
          stepId,
        });
      } else {
        await ProgressService.validateStep(
          locals.talent!.id,
          params.activityId,
          stepId,
          progressId,
          answerIndexStr,
          pinInput,
        );
      }
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
