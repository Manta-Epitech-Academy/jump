import { z } from 'zod';
import { HHMM_PATTERN } from '$lib/domain/event';
import { EVENT_MODULE_KEYS } from '$lib/domain/eventModules';

/**
 * Admin event configuration (the `/staff/admin/events` page): the friendly
 * public name, the Jump-owned start time, free-text notes, and the dev-workspace
 * surfaces the event exposes. One submit writes all four (see
 * `EventService.updateEventConfig`). `publicName` empty clears it (falls back to
 * the SF `titre`); `startTime` empty clears it to the type default; `modules`
 * empty = the event exposes nothing. Each module is validated against the
 * catalogue and persisted as `EventConfig_Module` rows (presence = enabled).
 */
export const adminEventSchema = z.object({
  id: z.string().min(1),
  publicName: z.string().trim().max(120).default(''),
  startTime: z
    .string()
    .regex(HHMM_PATTERN, 'Heure invalide (HH:MM).')
    .or(z.literal(''))
    .default(''),
  // End date as a campus-tz calendar day (`YYYY-MM-DD`). Salesforce only sends a
  // start `date`, never an end, so Jump owns the event's end-of-window here (like
  // it owns the start time-of-day). Empty clears it back to the type default span.
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ).')
    .or(z.literal(''))
    .default(''),
  notes: z.string().default(''),
  modules: z
    .array(z.enum(EVENT_MODULE_KEYS as [string, ...string[]]))
    .default([]),
});

export type AdminEventForm = z.infer<typeof adminEventSchema>;
