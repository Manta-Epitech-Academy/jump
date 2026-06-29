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
  inscrits: def({
    key: 'inscrits',
    kind: 'capability',
    defaultEnabled: true,
    label: 'Inscrits',
    description:
      "Registre des inscrits d'un événement (suivi des conformités, origine des talents). Désactivez pour les campus qui n'ont pas encore onboardé leurs talents.",
  }),
  entretiens: def({
    key: 'entretiens',
    kind: 'capability',
    defaultEnabled: true,
    label: 'Entretiens',
    description:
      "Suivi des entretiens de prospection menés auprès des inscrits d'un événement.",
  }),
  emargement: def({
    key: 'emargement',
    kind: 'capability',
    defaultEnabled: false,
    label: 'Émargement',
    description:
      "Feuille de présence par demi-journée. Activez pour les campus qui suivent la présence des talents pendant l'événement.",
  }),
  bilan: def({
    key: 'bilan',
    kind: 'capability',
    defaultEnabled: false,
    label: 'Bilan du stage',
    description:
      "Suivi des réponses au formulaire de bilan d'un événement (taux de réponse, statistiques) et QR code de partage à la cohorte.",
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
  staff_sync_errors: def({
    key: 'staff_sync_errors',
    kind: 'rollout',
    defaultEnabled: false,
    label: 'Doublons Salesforce',
    description:
      'Résolution des doublons de synchronisation Salesforce côté dev (/staff/dev/sync-errors).',
    removeBy: new Date('2026-07-15'),
  }),
  planning: def({
    key: 'planning',
    kind: 'capability',
    defaultEnabled: false,
    label: 'Planning',
    description:
      'Planning des stages / coding clubs (dev, pédago, talent). Activer pour les campus qui gèrent leur emploi du temps dans Jump.',
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
