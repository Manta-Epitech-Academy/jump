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
  WeekDomain,
  WantsMoreAnswer,
  SatisfactionContent,
  NextYearEvent,
  InterviewRecommendation,
} from '@prisma/client';
import { INTERVIEW_TEXT_LIMITS } from '$lib/domain/interview';

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
 * (`startInterview` / `saveInterview` autosave / `closeInterview` /
 * `reopenInterview`) with the same payload, so closing never drops unsaved
 * edits. `status`/`staffId` are NOT in the payload: the action owns the status
 * transition, so an autosave can never accidentally close an interview.
 */
export const interviewConductSchema = z.object({
  participationId: z.string().min(1, 'Participation requise'),

  // single-choice
  discoveryChannel: nullableEnum(DiscoveryChannel),
  motivation: nullableEnum(InterviewMotivation),
  orientationTalkAtSchool: nullableEnum(OrientationTalkFrequency),
  passionateTeacher: nullableEnum(PassionateTeacherAnswer),
  techProjection: nullableEnum(TechProjection),
  weekFavorite: nullableEnum(WeekDomain),
  wantsMore: nullableEnum(WantsMoreAnswer),
  satisfactionContent: nullableEnum(SatisfactionContent),
  recommendation: nullableEnum(InterviewRecommendation),

  // multi-choice
  specialties: z.array(z.enum(Specialty)).default([]),
  otherJobs: z.array(z.enum(OtherJobDomain)).default([]),
  infoSources: z.array(z.enum(InfoSource)).default([]),
  nextYearEvents: z.array(z.enum(NextYearEvent)).default([]),

  // scalars / free text
  satisfactionStars: z.number().int().min(1).max(5).nullable().default(null),
  teacherName: text(INTERVIEW_TEXT_LIMITS.teacherName),
  teacherSubject: text(INTERVIEW_TEXT_LIMITS.teacherSubject),
  oneSentence: text(INTERVIEW_TEXT_LIMITS.oneSentence),
  interviewerNote: text(INTERVIEW_TEXT_LIMITS.interviewerNote),
});

export type InterviewConductForm = z.infer<typeof interviewConductSchema>;
