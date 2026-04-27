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
      'Événement annuel de 2 semaines avec suivi de conformité (charte, matériel, conventions).',
  }),
  coding_club: def({
    key: 'coding_club',
    kind: 'capability',
    defaultEnabled: false,
    label: 'Coding Club',
    description: "Ateliers hebdomadaires tout le reste de l'année.",
  }),
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
