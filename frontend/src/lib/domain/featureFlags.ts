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
  minigames: def({
    key: 'minigames',
    kind: 'capability',
    defaultEnabled: false,
    label: 'Mini-jeux',
    description:
      'Active les mini-jeux du jour pour les talents (cf. MINIGAMES.md).',
  }),
  staff_intervenants: def({
    key: 'staff_intervenants',
    kind: 'rollout',
    defaultEnabled: false,
    label: 'Intervenants par événement',
    description:
      "Page d'assignation des mantas à un événement (/staff/dev/events/[id]/team).",
    removeBy: new Date('2026-07-15'),
  }),
  staff_campus_team: def({
    key: 'staff_campus_team',
    kind: 'rollout',
    defaultEnabled: false,
    label: 'Staff du campus',
    description:
      'Gestion des membres staff et invitations au niveau campus (/staff/dev/team).',
    removeBy: new Date('2026-07-15'),
  }),
  staff_welcome_page: def({
    key: 'staff_welcome_page',
    kind: 'rollout',
    defaultEnabled: false,
    label: "Édition page d'accueil talents",
    description:
      "Édition CMS de la page d'accueil affichée aux talents (dev + pedago).",
    removeBy: new Date('2026-07-15'),
  }),
  event_planning: def({
    key: 'event_planning',
    kind: 'rollout',
    defaultEnabled: false,
    label: 'Planning par événement (dev)',
    description:
      'Édition du planning détaillé (créneaux, activités) côté dev (/staff/dev/events/[id]/planning). Pedago conserve son propre planning.',
    removeBy: new Date('2026-07-15'),
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
