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
  talentId: z.string().min(1, 'Talent requis'),
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

export type InterviewGridForm = z.infer<typeof interviewGridSchema>;
export type ScheduleInterviewForm = z.infer<typeof scheduleInterviewSchema>;
export type UpdateInterviewStatusForm = z.infer<
  typeof updateInterviewStatusSchema
>;
