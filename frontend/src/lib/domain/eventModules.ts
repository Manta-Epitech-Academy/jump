import { EVENT_TYPES } from './event';

/**
 * Per-event "modules" = the dev-workspace surfaces a single event exposes.
 *
 * This is a DIFFERENT layer from feature flags (`featureFlags.ts`). A feature
 * flag answers "is this capability available to this campus/person at all"
 * (campus-scoped, request-resolved, governance/rollout). A module answers
 * "what does THIS event expose" (per-event, resolved at route level, part of
 * the event's identity). Two events on the same campus can expose different
 * modules, which is exactly why this can't live in the campus flag set.
 *
 * Membership: a module is enabled for an event iff an `EventConfig_Module` row
 * exists (presence = enabled). Keys stay plain strings (validated here, not a
 * DB enum) so adding a module needs no migration, mirroring `flagKey`.
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
  /** URL sub-path under `/staff/dev/events/[id]/`. */
  segment: string;
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
 * Module preset seeded onto a new event at creation, keyed by its event type.
 * The type is just a starting point: after creation the per-event module rows
 * are the truth and are edited independently (changing the type never rebinds
 * an existing event). Every type (stage, coding club, anything unknown the
 * worker imports) starts with all four surfaces on; admins trim per event from
 * the admin event-config page. Per-type rows stay so a future type can diverge.
 */
const DEFAULT_PRESET: EventModuleKey[] = [...EVENT_MODULE_KEYS];

export const EVENT_TYPE_PRESETS: Record<string, EventModuleKey[]> = {
  [EVENT_TYPES.STAGE_SECONDE]: DEFAULT_PRESET,
  [EVENT_TYPES.CODING_CLUB]: DEFAULT_PRESET,
};

export function presetModulesForType(eventType: string): EventModuleKey[] {
  return EVENT_TYPE_PRESETS[eventType] ?? DEFAULT_PRESET;
}

export function isEventModuleKey(value: string): value is EventModuleKey {
  return (EVENT_MODULE_KEYS as string[]).includes(value);
}

export function eventModuleLabel(key: string): string {
  return EVENT_MODULE_DEFS[key as EventModuleKey]?.label ?? key;
}

/** Whether a module is enabled, given a resolved set/list of an event's modules. */
export function eventHasModule(
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
 * First enabled module in display order: the surface the dev workspace lands
 * on for an event (replaces the old inscrits→entretiens→emargement flag
 * fallthrough). Returns null when the event exposes nothing.
 */
export function firstEnabledModule(
  modules: ReadonlySet<string> | readonly string[],
): EventModuleKey | null {
  for (const key of EVENT_MODULE_KEYS) {
    if (eventHasModule(modules, key)) return key;
  }
  return null;
}
