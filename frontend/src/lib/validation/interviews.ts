import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Le texte ne peut pas dépasser ${max} caractères`)
    .optional()
    .or(z.literal('').transform(() => undefined));

export const interviewGridSchema = z.object({
  id: z.string().min(1, 'Identifiant manquant'),
  discoveryReason: optionalText(1000),
  motivation: optionalText(1000),
  nextEventInterest: optionalText(500),
  influencers: optionalText(500),
  platforms: optionalText(500),
  specialties: optionalText(500),
  interests: optionalText(500),
  otherJobs: optionalText(500),
  satisfaction: optionalText(1000),
  globalNote: optionalText(2000),
});

export const scheduleInterviewSchema = z.object({
  participationId: z.string().min(1, 'Participation requise'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)'),
  time: z
    .string()
    .regex(
      /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/,
      'Format horaire invalide (HH:MM)',
    ),
});

export const updateInterviewStatusSchema = z.object({
  id: z.string().min(1, 'Identifiant manquant'),
  status: z.enum(['planned', 'completed', 'cancelled']),
});

export const autoScheduleInterviewsSchema = z.object({
  devIds: z.array(z.string().min(1)).min(1, 'Au moins un dev requis'),
  interviewsPerDevPerDay: z.coerce.number().int().min(1).max(10).default(3),
  slotDurationMinutes: z.coerce.number().int().min(15).max(120).default(30),
  dayStartHour: z.coerce.number().int().min(0).max(23).default(9),
  dayEndHour: z.coerce.number().int().min(1).max(23).default(17),
  lunchStartHour: z.coerce.number().int().min(0).max(23).default(12),
  lunchEndHour: z.coerce.number().int().min(1).max(24).default(13),
  participationOrder: z.enum(['name', 'random']).default('name'),
  mode: z.enum(['preview', 'apply']),
});

export type InterviewGridForm = z.infer<typeof interviewGridSchema>;
export type ScheduleInterviewForm = z.infer<typeof scheduleInterviewSchema>;
export type UpdateInterviewStatusForm = z.infer<
  typeof updateInterviewStatusSchema
>;
export type AutoScheduleInterviewsForm = z.infer<
  typeof autoScheduleInterviewsSchema
>;
