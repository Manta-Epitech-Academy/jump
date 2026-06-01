import { z } from 'zod';
import { HHMM_PATTERN } from '$lib/domain/event';

export const eventSchema = z.object({
  theme: z.string().default(''),
  notes: z.string().optional().or(z.literal('')),
});

// Event start time-of-day lives behind its own focused action (not the notes
// dialog) so editing notes can never clobber the time. "HH:MM" (24h); empty
// clears it back to the type default. Stored as `Event.startMinutes`.
export const startTimeSchema = z.object({
  startTime: z
    .string()
    .regex(HHMM_PATTERN, 'Heure invalide (HH:MM).')
    .or(z.literal(''))
    .default(''),
});

export type EventForm = z.infer<typeof eventSchema>;
