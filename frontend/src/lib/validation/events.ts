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
  // Per-module sub-options, keyed by module key (e.g. { inscrits: { showStatutColumn:
  // false } }). Kept loose here (the form is posted with `dataType: 'json'`); each
  // module's settings are authoritatively parsed against its own schema in the
  // service (`parseModuleSettings`), and only persisted for enabled modules.
  moduleSettings: z.record(z.string(), z.unknown()).default({}),
  // Explicit dev-workspace visibility gate (decoupled from modules).
  devActivated: z.boolean().default(false),
  // Which feedback form the event's `bilan` surface uses. Empty clears the
  // override → the event falls back to the form marked default for its type. A
  // non-empty value is a form id, checked server-side against an existing form.
  feedbackFormId: z.string().default(''),
});

export type AdminEventForm = z.infer<typeof adminEventSchema>;

/**
 * Bulk module edit from the admin events list: apply one exact module set to
 * every selected event at once (overwrite semantics, mirroring a single save).
 * `modules` empty = the selection exposes nothing. Posted from a plain enhanced
 * form, so this is parsed with `safeParse` in the action rather than superform.
 */
export const bulkEventModulesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  modules: z
    .array(z.enum(EVENT_MODULE_KEYS as [string, ...string[]]))
    .default([]),
});

/**
 * Bulk dev-workspace activation over the list selection: show/hide many events
 * in the dev workspace at once (the binary `devActivatedAt` gate, not modules).
 * Hand-parsed from a plain enhanced form like the module bulk.
 */
export const bulkEventActivationSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  activate: z.boolean(),
});

/**
 * "Enregistrer comme modèle" from the config wizard: snapshot the current module
 * config (presence + per-module settings + default feedback form) as a new named,
 * global `EventConfig_Template`. The config fields mirror the event form; the
 * snapshot is a point-in-time copy, with no live link back to the event. Module
 * settings stay loose here (authoritatively parsed per module in the service).
 */
export const eventConfigTemplateSaveSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis.').max(80),
  description: z.string().trim().max(280).default(''),
  // The SF event type the template was saved from, captured so the wizard can
  // suggest it for matching events (soft hint, not a binding).
  forEventType: z.string().default(''),
  modules: z
    .array(z.enum(EVENT_MODULE_KEYS as [string, ...string[]]))
    .default([]),
  moduleSettings: z.record(z.string(), z.unknown()).default({}),
  feedbackFormId: z.string().default(''),
});
