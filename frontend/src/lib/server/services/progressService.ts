import { getCached, setCached } from '$lib/server/infra/contentCache';
import { prisma } from '$lib/server/db';
import type { Activity } from '@prisma/client';

export type StepValidation = {
  type: 'auto_qcm' | 'manual_manta';
  qcm_data?: {
    question: string;
    options: string[];
    correct_index: number;
  };
  unlock_code?: string;
};

export type ActivityStep = {
  id: string;
  title: string;
  content_markdown: string;
  type: 'theory' | 'exercise' | 'checkpoint';
  validation?: StepValidation;
};

export type ActivityStructure = {
  steps: ActivityStep[];
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const ProgressService = {
  async validateStep(
    talentId: string,
    activityId: string,
    stepId: string,
    progressId: string,
    answerIndexStr: string | null,
    pinInput: string | null,
  ) {
    let activity = getCached<
      Activity & { contentStructure: ActivityStructure }
    >(activityId);
    if (!activity) {
      activity = (await prisma.activity.findUniqueOrThrow({
        where: { id: activityId },
      })) as Activity & { contentStructure: ActivityStructure };
      setCached(activityId, activity);
    }

    const content = (activity.contentStructure ?? {
      steps: [],
    }) as ActivityStructure;
    const steps = content.steps || [];

    const stepIndex = steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) throw new ValidationError('Étape introuvable');

    const step = steps[stepIndex];

    // 1. QCM Validation
    if (step.validation?.type === 'auto_qcm' && step.validation.qcm_data) {
      if (!answerIndexStr)
        throw new ValidationError('Veuillez sélectionner une réponse.');
      const answerIndex = parseInt(answerIndexStr, 10);

      if (step.validation.qcm_data.correct_index !== answerIndex) {
        throw new ValidationError('Mauvaise réponse. Essaie encore !');
      }
    }

    // 2. Fetch progress (needed for both PIN validation and step advancement)
    const progress = await prisma.stepsProgress.findUniqueOrThrow({
      where: { id: progressId },
    });
    if (progress.talentId !== talentId) {
      throw new ValidationError('Accès refusé.');
    }

    // 3. PIN Validation (Manual Manta)
    if (step.validation?.type === 'manual_manta') {
      if (!pinInput) throw new ValidationError('Code PIN requis.');

      const event = await prisma.event.findUniqueOrThrow({
        where: { id: progress.eventId },
        select: { pin: true },
      });

      if (!event.pin || pinInput !== event.pin) {
        throw new ValidationError('Code PIN incorrect.');
      }
    }

    // 4. Advance Progress Boundary
    const isLastStep = stepIndex === steps.length - 1;
    const nextStepId = !isLastStep ? steps[stepIndex + 1].id : 'COMPLETED';

    let newUnlockedId = progress.unlockedStepId;
    const currentUnlockedIndex = steps.findIndex((s) => s.id === newUnlockedId);

    if (
      newUnlockedId !== 'COMPLETED' &&
      (isLastStep || stepIndex >= currentUnlockedIndex)
    ) {
      newUnlockedId = nextStepId;
    }

    await prisma.stepsProgress.update({
      where: { id: progressId },
      data: {
        currentStepId: nextStepId === 'COMPLETED' ? stepId : nextStepId,
        unlockedStepId: newUnlockedId,
        status: nextStepId === 'COMPLETED' ? 'completed' : 'active',
        lastUnlockSource: 'student',
      },
    });
  },
};
