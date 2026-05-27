import type { BroadcastAudience, BroadcastChannel } from '@prisma/client';
import type { Niveau } from './niveau';
import { JUMP_LEVELS, type JumpLevel } from './xp';
import {
  IMAGE_RIGHTS_STATUS_LABELS,
  type ImageRightsStatus,
} from './imageRights';

export const BROADCAST_CHANNELS = [
  'mail',
  'sms',
] as const satisfies readonly BroadcastChannel[];

export const BROADCAST_CHANNEL_LABELS: Record<BroadcastChannel, string> = {
  mail: 'Mail',
  sms: 'SMS',
};

export const BROADCAST_AUDIENCES = [
  'talent',
  'parent',
  'dev',
  'peda',
  'manta',
  'superdev',
] as const satisfies readonly BroadcastAudience[];

export const BROADCAST_AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  talent: 'Talents',
  parent: 'Parents',
  dev: 'Dev (recrutement)',
  peda: 'Pédago',
  manta: 'Mantas',
  superdev: 'Superdev',
};

export const AUDIENCES_REQUIRING_EVENT: readonly BroadcastAudience[] = [
  'talent',
  'parent',
  'manta',
];

export type BroadcastVariableKey =
  | 'prenom'
  | 'nom'
  | 'email'
  | 'phone'
  | 'campus'
  | 'email_contact_campus'
  | 'event_name'
  | 'fastlogin_link'
  | 'parent_fastlogin_link'
  | 'otp_code'
  | 'parent_prenom'
  | 'parent_nom'
  | 'child_prenom'
  | 'child_nom'
  | 'login_link'
  | 'deletion_reason';

export interface BroadcastVariable {
  key: BroadcastVariableKey;
  token: string;
  label: string;
  demo: string;
  contextual: boolean;
}

export const BROADCAST_VARIABLES: readonly BroadcastVariable[] = [
  {
    key: 'prenom',
    token: '{{prenom}}',
    label: 'Prénom du destinataire',
    demo: 'Jean',
    contextual: false,
  },
  {
    key: 'nom',
    token: '{{nom}}',
    label: 'Nom du destinataire',
    demo: 'Dupont',
    contextual: false,
  },
  {
    key: 'email',
    token: '{{email}}',
    label: 'Email du destinataire',
    demo: 'jean.dupont@example.com',
    contextual: false,
  },
  {
    key: 'phone',
    token: '{{phone}}',
    label: 'Téléphone du destinataire',
    demo: '+33 6 12 34 56 78',
    contextual: false,
  },
  {
    key: 'campus',
    token: '{{campus}}',
    label: 'Campus du destinataire',
    demo: 'Paris',
    contextual: false,
  },
  {
    key: 'email_contact_campus',
    token: '{{EMAIL_CONTACT_CAMPUS}}',
    label: 'Email de contact du campus du destinataire',
    demo: 'contact.paris@epitech.eu',
    contextual: false,
  },
  {
    key: 'event_name',
    token: '{{event_name}}',
    label: "Nom de l'event lié à l'envoi",
    demo: 'Coding Club n°4',
    contextual: true,
  },
  {
    key: 'fastlogin_link',
    token: '{{fastlogin_link}}',
    label: 'Lien de connexion magique unique (par destinataire)',
    demo: 'https://jump.epiboost.fr/fastlogin?token=DEMO',
    contextual: true,
  },
  {
    key: 'parent_fastlogin_link',
    token: '{{parent_fastlogin_link}}',
    label: "Lien de connexion magique du parent (s'ouvre sur l'espace parent)",
    demo: 'https://jump.epiboost.fr/parent/fastlogin?token=DEMO',
    contextual: true,
  },
  {
    key: 'otp_code',
    token: '{{otp_code}}',
    label: 'Code OTP à usage unique (par destinataire)',
    demo: '[OTP_DEMO]',
    contextual: true,
  },
  {
    key: 'parent_prenom',
    token: '{{parent_prenom}}',
    label: 'Prénom du parent (emails parent)',
    demo: 'Sophie',
    contextual: true,
  },
  {
    key: 'parent_nom',
    token: '{{parent_nom}}',
    label: 'Nom du parent (emails parent)',
    demo: 'Dupont',
    contextual: true,
  },
  {
    key: 'child_prenom',
    token: '{{child_prenom}}',
    label: "Prénom de l'enfant (emails parent)",
    demo: 'Léa',
    contextual: true,
  },
  {
    key: 'child_nom',
    token: '{{child_nom}}',
    label: "Nom de l'enfant (emails parent)",
    demo: 'Dupont',
    contextual: true,
  },
  {
    key: 'login_link',
    token: '{{login_link}}',
    label: "Lien de connexion vers l'espace concerné",
    demo: 'https://jump.epiboost.fr/parent/login',
    contextual: true,
  },
  {
    key: 'deletion_reason',
    token: '{{deletion_reason}}',
    label: "Motif du refus d'une demande de suppression de compte",
    demo: 'Ton compte reste nécessaire pour le stage de seconde en cours.',
    contextual: true,
  },
] as const;

export const BROADCAST_VARIABLE_TOKENS = BROADCAST_VARIABLES.map(
  (v) => v.token,
);

// Canonical level catalogue lives in domain/xp.ts (derived from XP_LEVEL_TIERS),
// re-exported here so broadcast filter consumers keep their import path.
export { JUMP_LEVELS, type JumpLevel };

export type TristateFilter = 'yes' | 'no' | 'any';

// Image rights is no longer a yes/no flag: a refusal is its own audience (e.g.
// "warn the photographer", or exclude from photo-driven comms). Modelled as a
// multi-select over the three states, like `niveau`/`jumpLevel`.
export const IMAGE_RIGHTS_FILTER_OPTIONS = [
  'accepted',
  'refused',
  'undecided',
] as const satisfies readonly ImageRightsStatus[];

export const IMAGE_RIGHTS_FILTER_LABELS = IMAGE_RIGHTS_STATUS_LABELS;

export interface BroadcastFilters {
  niveau?: Niveau[];
  charterSigned?: TristateFilter;
  imageRights?: ImageRightsStatus[];
  jumpLevel?: JumpLevel[];
  hasPastEvent?: TristateFilter;
  hasFutureEvent?: TristateFilter;
}
