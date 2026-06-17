import { z } from 'zod';
import {
  DiscoveryChannel,
  InterviewMotivation,
  Specialty,
  OrientationTalkFrequency,
  PassionateTeacherAnswer,
  TechProjection,
  OtherJobDomain,
  InfoSource,
  WantsMoreAnswer,
  NextYearEvent,
  InterviewRecommendation,
} from '@prisma/client';
import {
  INTERVIEW_NOTE_LIMIT,
  INTERVIEW_TEXT_LIMITS,
} from '$lib/domain/interview';

// Single-choice answers: an enum value or null (unanswered). The chip group
// binds the form field directly, so the wire value is already the enum string
// or null; the `'' -> null` fallback guards any stray empty submit.
const nullableEnum = <T extends Record<string, string>>(e: T) =>
  z
    .enum(e)
    .nullable()
    .default(null)
    .or(z.literal('').transform(() => null));

// Free text stays a string in the form (empty = '') for clean binding; the
// action maps '' -> null before persisting so the DB never stores "".
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Le texte ne peut pas dépasser ${max} caractères`)
    .default('');

/**
 * The orientation-interview grid. One schema backs every lifecycle action
 * (`startInterview` / `saveInterview` autosave / `closeInterview`) with the
 * same payload, so closing never drops unsaved edits. `status`/`staffId` are
 * NOT in the payload: the action owns the status transition, so an autosave can
 * never accidentally close an interview.
 */
export const interviewConductSchema = z.object({
  participationId: z.string().min(1, 'Participation requise'),

  // single-choice
  discoveryChannel: nullableEnum(DiscoveryChannel),
  motivation: nullableEnum(InterviewMotivation),
  orientationTalkAtSchool: nullableEnum(OrientationTalkFrequency),
  passionateTeacher: nullableEnum(PassionateTeacherAnswer),
  wantsMore: nullableEnum(WantsMoreAnswer),
  recommendation: nullableEnum(InterviewRecommendation),

  // multi-choice
  techProjection: z.array(z.enum(TechProjection)).default([]),
  specialties: z.array(z.enum(Specialty)).default([]),
  otherJobs: z.array(z.enum(OtherJobDomain)).default([]),
  infoSources: z.array(z.enum(InfoSource)).default([]),
  nextYearEvents: z.array(z.enum(NextYearEvent)).default([]),

  // scalars / free text
  satisfactionStars: z.number().int().min(1).max(5).nullable().default(null),
  oneSentence: text(INTERVIEW_TEXT_LIMITS.oneSentence),
  verdictNote: text(INTERVIEW_TEXT_LIMITS.verdictNote),

  // Per-question note, one per choice/rating question (see NOTE_FIELDS). Always
  // shown under the question; the action maps '' -> null before persisting.
  discoveryChannelNote: text(INTERVIEW_NOTE_LIMIT),
  motivationNote: text(INTERVIEW_NOTE_LIMIT),
  specialtiesNote: text(INTERVIEW_NOTE_LIMIT),
  orientationTalkNote: text(INTERVIEW_NOTE_LIMIT),
  passionateTeacherNote: text(INTERVIEW_NOTE_LIMIT),
  techProjectionNote: text(INTERVIEW_NOTE_LIMIT),
  otherJobsNote: text(INTERVIEW_NOTE_LIMIT),
  infoSourcesNote: text(INTERVIEW_NOTE_LIMIT),
  wantsMoreNote: text(INTERVIEW_NOTE_LIMIT),
  satisfactionNote: text(INTERVIEW_NOTE_LIMIT),
  nextYearEventsNote: text(INTERVIEW_NOTE_LIMIT),
});

export type InterviewConductForm = z.infer<typeof interviewConductSchema>;
