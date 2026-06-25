import { z } from 'zod';
import { HHMM_PATTERN } from '$lib/domain/event';
import { EVENT_MODULE_KEYS } from '$lib/domain/eventModules';

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

// The dev-workspace surfaces an event exposes. The config dialog posts the
// checked module keys; an empty array = the event exposes nothing. Each entry
// is validated against the module catalogue. Persisted as `EventConfig_Module`
// rows (presence = enabled).
export const eventModulesSchema = z.object({
  modules: z
    .array(z.enum(EVENT_MODULE_KEYS as [string, ...string[]]))
    .default([]),
});

export type EventForm = z.infer<typeof eventSchema>;
