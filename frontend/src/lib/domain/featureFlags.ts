import { EVENT_TYPES, type EventType } from './event';

export type FlagKind = 'capability' | 'rollout';

export interface FlagDef {
  key: string;
  kind: FlagKind;
  defaultEnabled: boolean;
  label: string;
  description: string;
  removeBy?: Date;
}

const def = <K extends string>(d: FlagDef & { key: K }): FlagDef & { key: K } =>
  d;

export const FEATURE_FLAGS = {
  stage_seconde: def({
    key: 'stage_seconde',
    kind: 'capability',
    defaultEnabled: true,
    label: 'Stage de Seconde',
    description:
      'Événement annuel de 2 semaines avec suivi de conformité (règlement intérieur, matériel, droits à l’image).',
  }),
  coding_club: def({
    key: 'coding_club',
    kind: 'capability',
    defaultEnabled: false,
    label: 'Coding Club',
    description: "Ateliers hebdomadaires tout le reste de l'année.",
  }),
  // Inscrits / Entretiens / Émargement / Bilan are no longer campus flags: they
  // are now per-event "modules" (see $lib/domain/eventModules + EventConfig_Module),
  // so two events on the same campus can expose different surfaces. Planning stays
  // a campus flag below because it also gates the pedago editor and talent calendar.
  staff_campus_team: def({
    key: 'staff_campus_team',
    kind: 'rollout',
    defaultEnabled: false,
    label: 'Staff du campus',
    description:
      'Gestion des membres staff et invitations au niveau campus (/staff/dev/team).',
    removeBy: new Date('2026-07-15'),
  }),
  news_feed: def({
    key: 'news_feed',
    kind: 'rollout',
    defaultEnabled: false,
    label: "Fil d'actualites",
    description:
      "Fil d'actualites CMS sur le dashboard talent, editable par les devs et admins.",
  }),
  staff_sync_errors: def({
    key: 'staff_sync_errors',
    kind: 'rollout',
    defaultEnabled: false,
    label: 'Doublons Salesforce',
    description:
      'Résolution des doublons de synchronisation Salesforce côté dev (/staff/dev/sync-errors).',
    removeBy: new Date('2026-07-15'),
  }),
  // Planning is intentionally NOT a flag: it is data-driven. The dev view and
  // the talent calendar show wherever an event has a schedule; the pedago editor
  // (the build tool) is gated by role (pedaLead). See $lib/domain/eventModules
  // (planning note) and the planning loads.
};

export type FlagKey = keyof typeof FEATURE_FLAGS;
export const FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FlagKey[];

export const EVENT_TYPE_TO_FLAG: Record<EventType, FlagKey> = {
  [EVENT_TYPES.STAGE_SECONDE]: 'stage_seconde',
  [EVENT_TYPES.CODING_CLUB]: 'coding_club',
};

export function resolveEffectiveFlags(
  overrides: ReadonlyArray<{ flagKey: string; enabled: boolean }>,
): Set<FlagKey> {
  const enabled = new Set<FlagKey>();
  const overrideMap = new Map(overrides.map((o) => [o.flagKey, o.enabled]));
  for (const def of Object.values(FEATURE_FLAGS)) {
    const on = overrideMap.has(def.key)
      ? overrideMap.get(def.key)!
      : def.defaultEnabled;
    if (on) enabled.add(def.key as FlagKey);
  }
  return enabled;
}
