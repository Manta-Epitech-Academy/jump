import type { BroadcastAudience, BroadcastChannel } from '@prisma/client';
import type { Niveau } from './niveau';

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

export const SMS_MAX_LENGTH = 160;
// Approximate cost of `&tracking_id=<cuid>` once injected.
// cuid is ~25 chars + `&tracking_id=` is 13 chars = 38. Round up.
export const SMS_TRACKING_ID_OVERHEAD = 40;

export type BroadcastVariableKey =
  | 'prenom'
  | 'nom'
  | 'email'
  | 'phone'
  | 'campus'
  | 'event_name'
  | 'fastlogin_link'
  | 'otp_code'
  | 'parent_prenom'
  | 'parent_nom'
  | 'child_prenom'
  | 'child_nom'
  | 'login_link';

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
] as const;

export const BROADCAST_VARIABLE_TOKENS = BROADCAST_VARIABLES.map(
  (v) => v.token,
);

export const JUMP_LEVELS = ['Novice', 'Apprentice', 'Expert'] as const;
export type JumpLevel = (typeof JUMP_LEVELS)[number];

export type TristateFilter = 'yes' | 'no' | 'any';

export interface BroadcastFilters {
  niveau?: Niveau[];
  charterSigned?: TristateFilter;
  imageRightsSigned?: TristateFilter;
  jumpLevel?: JumpLevel[];
  hasPastEvent?: TristateFilter;
  hasFutureEvent?: TristateFilter;
}

export function estimateSmsLength(body: string): number {
  const urlRegex = /\bhttps?:\/\/[^\s<>"')]+/gi;
  const urlCount = body.match(urlRegex)?.length ?? 0;
  return body.length + urlCount * SMS_TRACKING_ID_OVERHEAD;
}
