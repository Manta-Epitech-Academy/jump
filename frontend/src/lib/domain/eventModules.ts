import { z } from 'zod';

/**
 * Per-event "modules" = the dev-workspace surfaces a single event exposes.
 *
 * A module answers "what does THIS event expose" (per-event, resolved at route
 * level, part of the event's identity). Two events on the same campus can expose
 * different modules, which is why this is per-event and not a campus-wide toggle.
 *
 * Membership: a module is enabled for an event iff an `EventConfig_Module` row
 * exists (presence = enabled). Keys stay plain strings (validated here, not a
 * DB enum) so adding a module needs no migration.
 */
// NOTE: planning is deliberately NOT a module. It is a read-only window onto
// pedago/admin-owned schedule data, so a dev toggle would be hollow (the dev
// can't produce the data). Its visibility is data-driven instead: the dev view
// and the talent calendar appear wherever an event actually has time slots. See
// the planning page load + resolveWorkspaceEvents `hasPlanning`.
export const EVENT_MODULES = {
  INSCRITS: 'inscrits',
  EMARGEMENT: 'emargement',
  BILAN: 'bilan',
  ENTRETIENS: 'entretiens',
} as const;

export type EventModuleKey = (typeof EVENT_MODULES)[keyof typeof EVENT_MODULES];

/** Sidebar / config display order. */
export const EVENT_MODULE_KEYS = Object.values(
  EVENT_MODULES,
) as EventModuleKey[];

export interface EventModuleDef {
  key: EventModuleKey;
  /** Nav + config label (FR, staff-facing → vous). */
  label: string;
  /** Help text shown in the event-config dialog. */
  description: string;
  /** URL sub-path under `/staff/dev/events/[id]/` (a module's route folder name). */
  segment: EventModuleKey;
}

const def = (d: EventModuleDef): EventModuleDef => d;

export const EVENT_MODULE_DEFS: Record<EventModuleKey, EventModuleDef> = {
  [EVENT_MODULES.INSCRITS]: def({
    key: EVENT_MODULES.INSCRITS,
    label: 'Inscrits',
    description:
      "La liste des jeunes inscrits : d'où ils viennent et si leur dossier est complet.",
    segment: 'inscrits',
  }),
  [EVENT_MODULES.EMARGEMENT]: def({
    key: EVENT_MODULES.EMARGEMENT,
    label: 'Émargement',
    description:
      "La feuille de présence : pointer qui est là, le matin et l'après-midi.",
    segment: 'emargement',
  }),
  [EVENT_MODULES.BILAN]: def({
    key: EVENT_MODULES.BILAN,
    label: 'Feedback',
    description:
      'Les réponses des jeunes au questionnaire de fin, leurs statistiques, et un QR code à partager pour le remplir.',
    segment: 'bilan',
  }),
  [EVENT_MODULES.ENTRETIENS]: def({
    key: EVENT_MODULES.ENTRETIENS,
    label: 'Entretiens',
    description:
      "Les entretiens d'orientation, un par jeune : noter le ressenti, le projet et la suite du parcours.",
    segment: 'entretiens',
  }),
};

/**
 * Modules seeded onto a new event at creation. The event type is only a starting
 * point: after creation the per-event module rows are the truth and are edited
 * independently (changing the type never rebinds an existing event). Every type
 * (stage, coding club, anything the worker imports) starts with all four surfaces
 * on; admins trim per event from the admin event-config page. There is no
 * per-type table because no type's default actually differs today - branch on
 * `eventType` here the day one does.
 */
export function presetModulesForType(_eventType: string): EventModuleKey[] {
  return [...EVENT_MODULE_KEYS];
}

export function isEventModuleKey(value: string): value is EventModuleKey {
  return (EVENT_MODULE_KEYS as string[]).includes(value);
}

/**
 * Per-module sub-options, persisted as the `settings` Json on each
 * `EventConfig_Module` row (and mirrored on `EventConfig_TemplateModule`). Each
 * schema parses an unknown Json bag into a fully-defaulted typed object, so
 * callers never branch on missing keys. Extra keys are stripped (Zod object
 * default), so a settings shape can grow without breaking old rows. A module
 * with no sub-options uses the empty schema. FKs (the bilan feedback form) stay
 * typed columns on `Event`, never in here.
 */
const inscritsModuleSettingsSchema = z.object({
  // Show the dossier/statut funnel column (connexion, règlement, droit à l'image)
  // on the Inscrits table for this event. Opt-in: defaults off, an admin turns it
  // on per event from the config wizard (onboarding campuses want it; others, e.g.
  // Paris with interviews + public bilan only, leave it off). Gates ONLY that
  // column, never the talent fiche.
  showStatutColumn: z.boolean().default(false),
  // Show the "Générer diplômes" export (the internship Certificat de stage) on the
  // Inscrits header. Opt-in: defaults off, so nothing stage-specific surfaces until
  // an admin enables it (a coding club issues no certificate; even a stage turns it
  // on explicitly). Gating goes through this sub-option, never an eventType check
  // at the call site.
  diplomas: z.boolean().default(false),
});

const emptyModuleSettingsSchema = z.object({});

const EVENT_MODULE_SETTINGS_SCHEMAS = {
  [EVENT_MODULES.INSCRITS]: inscritsModuleSettingsSchema,
  [EVENT_MODULES.EMARGEMENT]: emptyModuleSettingsSchema,
  [EVENT_MODULES.BILAN]: emptyModuleSettingsSchema,
  [EVENT_MODULES.ENTRETIENS]: emptyModuleSettingsSchema,
} as const;

export type EventModuleSettings = {
  [K in EventModuleKey]: z.infer<(typeof EVENT_MODULE_SETTINGS_SCHEMAS)[K]>;
};

/**
 * Parse a raw `settings` Json (DB column or posted form value) into the typed,
 * fully-defaulted settings for `key`. Falls back to all-defaults on any malformed
 * input, so a hand-edited or legacy row can never crash a read.
 */
export function parseModuleSettings<K extends EventModuleKey>(
  key: K,
  raw: unknown,
): EventModuleSettings[K] {
  const schema = EVENT_MODULE_SETTINGS_SCHEMAS[key] as unknown as z.ZodType<
    EventModuleSettings[K]
  >;
  const parsed = schema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : schema.parse({});
}

/** The all-defaults settings for a module (used when a module is freshly enabled). */
export function defaultModuleSettings<K extends EventModuleKey>(
  key: K,
): EventModuleSettings[K] {
  return parseModuleSettings(key, {});
}

/** Whether a module exposes any sub-options (drives the advanced section in the wizard). */
export function moduleHasSettings(key: EventModuleKey): boolean {
  return (
    Object.keys(
      (EVENT_MODULE_SETTINGS_SCHEMAS[key] as z.ZodObject<z.ZodRawShape>).shape,
    ).length > 0
  );
}

export function eventModuleLabel(key: string): string {
  return EVENT_MODULE_DEFS[key as EventModuleKey]?.label ?? key;
}

/** Whether a module is enabled, given a resolved set/list of an event's modules. */
function eventHasModule(
  modules: ReadonlySet<string> | readonly string[],
  key: EventModuleKey,
): boolean {
  // Keep the Set's O(1) lookup the callers built (loadEventOr404 returns a
  // Set precisely for membership tests); only the array case pays a scan.
  // (`instanceof Set` narrows cleanly where `Array.isArray` can't, because TS
  // won't remove `readonly string[]` from the union for the array guard.)
  return modules instanceof Set ? modules.has(key) : [...modules].includes(key);
}

/**
 * A dev-workspace "surface" is a sidebar entry / landable page. Most surfaces
 * are modules (a row's presence = enabled), but two carry a second, data-driven
 * gate beyond the module row, so "which page can a dev actually reach" is not the
 * raw module set:
 *  - `planning` is not a module at all (read-only pedago/admin schedule data): it
 *    is reachable only when the event has a real schedule.
 *  - `bilan` is a module but also needs a resolvable live feedback form, or its
 *    page 404s.
 * This projection folds those gates in one place so the sidebar nav, the event
 * switcher and the dev landing all agree on the reachable set. Routing off the
 * raw module set instead (the old `firstEnabledModule`) sent the switcher and the
 * landing into a 404 for a bilan-without-form event the nav had already hidden.
 */
export type EventSurfaceKey = EventModuleKey | 'planning';

/**
 * Sidebar / landing order. Modules keep their `EVENT_MODULE_KEYS` order; the
 * `planning` pseudo-surface is interleaved where the nav shows it (between
 * émargement and bilan).
 */
const EVENT_SURFACE_ORDER: EventSurfaceKey[] = [
  EVENT_MODULES.INSCRITS,
  EVENT_MODULES.EMARGEMENT,
  'planning',
  EVENT_MODULES.BILAN,
  EVENT_MODULES.ENTRETIENS,
];

/** The per-event signals a surface's reachability folds in. */
export interface EventSurfaceGates {
  modules: ReadonlySet<string> | readonly string[];
  /** Event has a schedule (≥1 time slot): gates `planning`. */
  hasPlanning: boolean;
  /** Event resolves a live feedback form: gates `bilan` on top of its module. */
  hasFeedbackForm: boolean;
}

/** Whether a dev can actually reach a surface, module presence + data gates. */
function isSurfaceReachable(
  key: EventSurfaceKey,
  gates: EventSurfaceGates,
): boolean {
  if (key === 'planning') return gates.hasPlanning;
  if (!eventHasModule(gates.modules, key)) return false;
  if (key === EVENT_MODULES.BILAN) return gates.hasFeedbackForm;
  return true;
}

/** Reachable surfaces in sidebar order. */
export function reachableSurfaces(gates: EventSurfaceGates): EventSurfaceKey[] {
  return EVENT_SURFACE_ORDER.filter((key) => isSurfaceReachable(key, gates));
}

/**
 * The surface the dev workspace lands on for an event (first reachable in
 * display order), or null when the event exposes nothing reachable.
 */
export function firstReachableSurface(
  gates: EventSurfaceGates,
): EventSurfaceKey | null {
  return reachableSurfaces(gates)[0] ?? null;
}

/**
 * URL sub-path under `/staff/dev/events/[id]/` for a surface. Returns the literal
 * segment union (not a bare `string`) so `resolve()` at the call sites can verify
 * the built `/staff/dev/events/[id]/<segment>` path against the real route tree.
 */
export function surfaceSegment(key: EventSurfaceKey): EventSurfaceKey {
  return key === 'planning' ? 'planning' : EVENT_MODULE_DEFS[key].segment;
}

/** Sidebar label for a surface (FR, staff-facing → vous). */
export function surfaceLabel(key: EventSurfaceKey): string {
  return key === 'planning' ? 'Planning' : EVENT_MODULE_DEFS[key].label;
}
