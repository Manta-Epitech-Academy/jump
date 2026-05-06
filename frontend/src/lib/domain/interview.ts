import type { LifecycleBounds } from './eventLifecycle';

/**
 * Display-level status for an interview slot, derived from its DB state plus
 * the current calendar day.
 *
 * The DB enum (`InterviewStatus = planned | completed | cancelled`) collapses
 * the "scheduled in the future" and "scheduled but the day has passed" cases
 * into a single `planned`. Staff need to see those distinctly: an overdue
 * planned interview is the same alert kind that fires on the dashboard
 * (`interviews-overdue`), so the chip on the inscrits card and the alert badge
 * derive from the *same* boundary check.
 */
export type InterviewDisplayStatus =
  | 'none'
  | 'planned'
  | 'overdue'
  | 'done'
  | 'cancelled';

type InterviewLike = {
  status: 'planned' | 'completed' | 'cancelled';
  date: Date;
};

export function getInterviewDisplayStatus(
  interview: InterviewLike | null | undefined,
  bounds: Pick<LifecycleBounds, 'startOfDay'>,
): InterviewDisplayStatus {
  if (!interview) return 'none';
  if (interview.status === 'completed') return 'done';
  if (interview.status === 'cancelled') return 'cancelled';
  if (interview.date.getTime() < bounds.startOfDay.getTime()) return 'overdue';
  return 'planned';
}

export const INTERVIEW_DISPLAY_LABELS: Record<InterviewDisplayStatus, string> =
  {
    none: 'À planifier',
    planned: 'Planifié',
    overdue: 'En retard',
    done: 'Mené',
    cancelled: 'Annulé',
  };
