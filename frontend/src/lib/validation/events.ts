import { z } from 'zod';
import { HHMM_PATTERN } from '$lib/domain/event';
import { EVENT_MODULE_KEYS } from '$lib/domain/eventModules';

/**
 * Admin event configuration (the `/staff/admin/events` page): the friendly
 * public name, the Jump-owned start time, and the dev-workspace surfaces the
 * event exposes. One submit writes them all (see
 * `EventService.updateEventConfig`). `publicName` empty clears it (falls back to
 * the SF `titre`); `startTime` empty clears it to none; `modules`
 * empty = the event exposes nothing. Each module is validated against the
 * catalogue and persisted as `EventConfig_Module` rows (presence = enabled).
 */
export const adminEventSchema = z.object({
  id: z.string().min(1),
  publicName: z.string().trim().max(120).default(''),
  // What this event's cohort is called in the dev workspace ("stagiaire",
  // "participant", "collégien", ...). Jump-owned free text, not derived from the
  // SF type. Blank means "not named yet": the service stores NULL and the UI falls
  // back to the neutral default, so an unconfigured event reads "participant"
  // without the column claiming a choice nobody made. Capped so it stays a noun.
  cohortNoun: z.string().trim().max(40).default(''),
  startTime: z
    .string()
    .regex(HHMM_PATTERN, 'Heure invalide (HH:MM).')
    .or(z.literal(''))
    .default(''),
  // End date as a campus-tz calendar day (`YYYY-MM-DD`). Salesforce only sends a
  // start `date`, never an end, so Jump owns the event's end-of-window here (like
  // it owns the start time-of-day). Empty = no end date, and the event reads as a single-day window.
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ).')
    .or(z.literal(''))
    .default(''),
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
  // Which feedback form the event's `bilan` surface uses. Empty = no form, and
  // the bilan surface stays hidden; there is no per-type fallback any more. A
  // non-empty value is a form id, checked server-side against an existing form.
  feedbackFormId: z.string().default(''),
  // Which certificate the event issues on its Inscrits export. Empty = none, and
  // the export disappears. A non-empty value is a `Diploma_Template` id, checked
  // server-side against an existing row.
  diplomaTemplateId: z.string().default(''),
  // Which closing grid this event's 1:1s use. Empty = it holds no closings, and
  // the surface stays hidden; there is no per-type fallback. A non-empty value is
  // a `Closing_Template` id, checked server-side against an existing row.
  closingTemplateId: z.string().default(''),
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
 * config (presence + per-module settings + the feedback form and certificate) as a new named,
 * global `EventConfig_Template`. The config fields mirror the event form; the
 * snapshot is a point-in-time copy, with no live link back to the event. Module
 * settings stay loose here (authoritatively parsed per module in the service).
 */
export const eventConfigTemplateSaveSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis.').max(80),
  description: z.string().trim().max(280).default(''),
  // The friendly event name the preset carries (e.g. "Coding Club"). Empty = the
  // preset prefills no name (the event keeps the SF titre). Mirrors the event
  // form's `publicName`; campuses reuse one display name across every occurrence
  // of a format, so a preset that prefills it saves retyping it each time.
  publicName: z.string().trim().max(120).default(''),
  // Cohort noun the preset carries; copied onto the event on apply (mirrors the
  // event form's free-text `cohortNoun`). Blank → stored NULL, like the event.
  cohortNoun: z.string().trim().max(40).default(''),
  // Jump-owned arrival time-of-day the preset carries (mirrors the event form's
  // `startTime`). Empty = the preset names no arrival time.
  startTime: z
    .string()
    .regex(HHMM_PATTERN, 'Heure invalide (HH:MM).')
    .or(z.literal(''))
    .default(''),
  modules: z
    .array(z.enum(EVENT_MODULE_KEYS as [string, ...string[]]))
    .default([]),
  moduleSettings: z.record(z.string(), z.unknown()).default({}),
  feedbackFormId: z.string().default(''),
  // The certificate the preset carries, copied onto the event on apply. Mirrors
  // the event form's `diplomaTemplateId`; empty = the preset names none.
  diplomaTemplateId: z.string().default(''),
  // Same for the closing grid, and for the same reason: a preset that copied the
  // modules but not the grid would apply a closings surface with nothing to ask.
  closingTemplateId: z.string().default(''),
});
