import { getCachedSubject, setCachedSubject } from '$lib/server/subjectCache';
import type { TypedPocketBase, SubjectsResponse } from '$lib/pocketbase-types';

export type StepValidation = {
  type: 'auto_qcm' | 'manual_manta';
  qcm_data?: {
    question: string;
    options: string[];
    correct_index: number;
  };
  unlock_code?: string;
};

export type SubjectStep = {
  id: string;
  title: string;
  content_markdown: string;
  type: 'theory' | 'exercise' | 'checkpoint';
  validation?: StepValidation;
};

export type SubjectStructure = {
  steps: SubjectStep[];
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const ProgressService = {
  /**
   * Validates a step (QCM or Manta PIN) and advances the student's progress boundaries.
   * Throws ValidationError for user-facing errors (wrong answer, bad PIN).
   * Throws regular Error for unexpected server failures.
   */
  async validateStep(
    studentPb: TypedPocketBase,
    systemPb: TypedPocketBase,
    studentId: string,
    subjectId: string,
    stepId: string,
    progressId: string,
    answerIndexStr: string | null,
    pinInput: string | null,
  ) {
    let subject = getCachedSubject<SubjectsResponse<SubjectStructure>>(subjectId);
    if (!subject) {
      subject = await studentPb.collection('subjects').getOne(subjectId);
      setCachedSubject(subjectId, subject);
    }

    const content = (subject.content_structure ?? { steps: [] }) as SubjectStructure;
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

    // 2. PIN Validation (Manual Manta)
    if (step.validation?.type === 'manual_manta') {
      if (!pinInput) throw new ValidationError('Code PIN requis.');

      // Fetch participation to find the event
      const participations = await studentPb
        .collection('participations')
        .getFullList({
          filter: `student = "${studentId}" && subjects ~ "${subjectId}"`,
          sort: '-created',
        });

      if (participations.length === 0) {
        throw new ValidationError("Tu n'es pas assigné à ce sujet.");
      }

      // Use systemPb (admin) to read the PIN safely
      const event = await systemPb
        .collection('events')
        .getOne(participations[0].event);

      if (!event.pin || pinInput !== event.pin) {
        throw new ValidationError('Code PIN incorrect.');
      }
    }

    // 3. Advance Progress Boundary
    const progress = await studentPb
      .collection('steps_progress')
      .getOne(progressId);
    const isLastStep = stepIndex === steps.length - 1;
    const nextStepId = !isLastStep ? steps[stepIndex + 1].id : 'COMPLETED';

    let newUnlockedId = progress.unlocked_step_id;
    const currentUnlockedIndex = steps.findIndex((s) => s.id === newUnlockedId);

    // Only advance if completing their furthest step
    if (
      newUnlockedId !== 'COMPLETED' &&
      (isLastStep || stepIndex >= currentUnlockedIndex)
    ) {
      newUnlockedId = nextStepId;
    }

    await studentPb.collection('steps_progress').update(progressId, {
      current_step_id: nextStepId === 'COMPLETED' ? stepId : nextStepId,
      unlocked_step_id: newUnlockedId,
      status: nextStepId === 'COMPLETED' ? 'completed' : 'active',
      last_unlock_source: 'student',
    });
  },
};
