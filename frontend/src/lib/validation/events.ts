import { z } from 'zod';
import { CalendarDateTime } from '@internationalized/date';
import { m } from '$lib/paraglide/messages.js';

export const eventSchema = z.object({
  titre: z
    .string()
    .min(3, { error: () => m.validation_min_length({ min: 3 }) })
    .max(100, { error: () => m.validation_max_length({ max: 100 }) }),
  date: z.union(
    [
      z.custom<CalendarDateTime>((val) => val instanceof CalendarDateTime),
      z.string(),
    ],
    { error: () => m.validation_date_required() },
  ),
  time: z
    .string()
    .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
      error: () => m.validation_time_format(),
    }),
  theme: z.string().default(''),
  notes: z.string().optional().or(z.literal('')),
  subject: z.string().optional(),
  mantas: z.array(z.string()).default([]),
});

export const addParticipantSchema = z.object({
  studentId: z
    .string()
    .min(1, { error: () => m.validation_student_required() }),
});

export type EventForm = z.infer<typeof eventSchema>;
export type AddParticipantForm = z.infer<typeof addParticipantSchema>;
