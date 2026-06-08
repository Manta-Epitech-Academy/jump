import { InterviewRecommendation } from '@prisma/client';
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

/**
 * Chip color classes per display status, mapped onto the Epitech charte
 * palette (epi-blue / epi-teal-solid / epi-orange). Single brand-token source
 * for the interviews views so every interview-status chip stays on-charte (no
 * off-brand green / amber / yellow Tailwind utilities).
 */
export const INTERVIEW_STATUS_CHIP_CLASS: Record<
  InterviewDisplayStatus,
  string
> = {
  none: 'border-border bg-muted text-muted-foreground',
  planned: 'border-epi-blue/40 bg-epi-blue/10 text-epi-blue',
  overdue: 'border-epi-orange/50 bg-epi-orange/10 text-epi-orange',
  done: 'border-epi-teal-solid/40 bg-epi-teal-solid/10 text-epi-teal-solid',
  cancelled: 'border-border bg-muted text-muted-foreground line-through',
};

/**
 * Fixed slot duration for a single interview (minutes). Drives:
 *   - The conflict window when reassigning (`reassignInterview` action).
 *   - DTEND in the iCalendar invites the email backend emits.
 *   - The Outlook event end time the Graph backend POSTs.
 *
 * The auto-scheduler accepts a *configurable* `slotDurationMinutes` for
 * generating the initial planning, so this constant is *not* what the
 * scheduler uses — it's the canonical "how long is one slot, after the
 * fact" answer that all downstream emitters share.
 */
export const INTERVIEW_SLOT_MINUTES = 30;

/**
 * Recommendation outcome chosen by the interviewer at the end of the grid.
 * Surfaced as a structured chip on the talent fiche, on inscrits cards, and
 * aggregated for the post-stage bilan. Decoupled from the free-text
 * `globalNote` so it can be aggregated and filtered.
 */
export type RecommendationToneToken =
  | 'epi-tech'
  | 'epi-blue'
  | 'epi-tomorrow'
  | 'epi-drift';

export type RecommendationDescriptor = {
  label: string;
  tone: RecommendationToneToken;
  short: string;
};

export const INTERVIEW_RECOMMENDATIONS: Record<
  InterviewRecommendation,
  RecommendationDescriptor
> = {
  epitech_orientation_forte: {
    label: 'Epitech — orientation forte',
    short: 'Epitech',
    tone: 'epi-tech',
  },
  a_explorer: {
    label: 'À explorer',
    short: 'À explorer',
    tone: 'epi-blue',
  },
  autre_filiere: {
    label: 'Autre filière',
    short: 'Autre',
    tone: 'epi-tomorrow',
  },
  a_determiner: {
    label: 'À déterminer',
    short: 'À déterminer',
    tone: 'epi-drift',
  },
};

export function recommendationLabel(
  reco: InterviewRecommendation | null | undefined,
): string | null {
  if (!reco) return null;
  return INTERVIEW_RECOMMENDATIONS[reco]?.label ?? null;
}

export function recommendationDescriptor(
  reco: InterviewRecommendation | null | undefined,
): RecommendationDescriptor | null {
  if (!reco) return null;
  return INTERVIEW_RECOMMENDATIONS[reco] ?? null;
}

export const INTERVIEW_RECOMMENDATION_VALUES: readonly InterviewRecommendation[] =
  Object.keys(INTERVIEW_RECOMMENDATIONS) as InterviewRecommendation[];
