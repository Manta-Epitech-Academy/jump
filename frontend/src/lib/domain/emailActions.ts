/**
 * Transactional email actions that route through the admin template
 * system. Each action declares its key (stored in EmailActionMapping),
 * a human label for the admin UI, a description, and the set of
 * `{{variables}}` the bound template should use.
 *
 * Calendar invites (REQUEST/CANCEL) are deliberately NOT in this list —
 * they carry a `.ics` attachment and their body is utilitarian (mail
 * clients render the calendar, not the body). Kept on hardcoded text.
 */

import type { BroadcastVariableKey } from './broadcasts';

export interface EmailAction {
  key: string;
  label: string;
  description: string;
  /**
   * Variables the bound template is expected to use. Used by the admin
   * UI to nudge template authors and validate. Other variables can still
   * be referenced but render empty.
   */
  variables: readonly BroadcastVariableKey[];
}

export const EMAIL_ACTIONS = {
  otp_talent: {
    key: 'otp_talent',
    label: 'Code OTP — Connexion talent',
    description:
      'Envoyé quand un talent demande un code de connexion depuis /login.',
    variables: ['prenom', 'otp_code'],
  },
  otp_parent: {
    key: 'otp_parent',
    label: 'Code OTP — Connexion parent',
    description:
      'Envoyé quand un parent demande un code de connexion depuis /parent/login.',
    variables: ['parent_prenom', 'otp_code', 'login_link'],
  },
  parent_welcome: {
    key: 'parent_welcome',
    label: 'Bienvenue parent',
    description:
      "Envoyé au parent quand son enfant termine l'onboarding et lui ouvre l'espace parent.",
    variables: ['parent_prenom', 'child_prenom', 'login_link'],
  },
  relance_student: {
    key: 'relance_student',
    label: 'Relance — étudiant',
    description:
      "Envoyé par le staff dev pour pousser un étudiant à finaliser son onboarding. Le template fournit le brouillon initial (sujet + corps) ; le staff peut l'éditer avant envoi.",
    variables: ['prenom', 'nom', 'login_link'],
  },
  relance_parent: {
    key: 'relance_parent',
    label: 'Relance — parent',
    description:
      "Envoyé par le staff dev pour pousser un parent à signer le droit à l'image. Brouillon éditable avant envoi.",
    variables: ['parent_prenom', 'parent_nom', 'child_prenom', 'login_link'],
  },
  account_deletion_refused: {
    key: 'account_deletion_refused',
    label: 'Suppression de compte — refus',
    description:
      "Envoyé au talent quand l'équipe refuse sa demande de suppression de compte. RGPD art. 12(4) : le corps DOIT donner le motif ({{deletion_reason}}) et rappeler le droit de réclamation auprès de la CNIL (cnil.fr).",
    variables: ['prenom', 'deletion_reason'],
  },
  account_deletion_done: {
    key: 'account_deletion_done',
    label: 'Suppression de compte — confirmation',
    description:
      "Envoyé au talent au moment où l'équipe procède à l'effacement de son compte (anonymisation). Dernier message possible : son adresse est effacée juste après.",
    variables: ['prenom'],
  },
} as const satisfies Record<string, EmailAction>;

export type EmailActionKey = keyof typeof EMAIL_ACTIONS;

export const EMAIL_ACTION_KEYS = Object.keys(
  EMAIL_ACTIONS,
) as readonly EmailActionKey[];
