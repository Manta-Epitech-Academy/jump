/**
 * Transactional email actions that route through the admin template
 * system. Each action declares its key (stored in EmailActionMapping),
 * a French label and description (read by the admin API), and the set of
 * `{{variables}}` the bound template should use, then must use.
 *
 * Calendar invites (REQUEST/CANCEL) are deliberately NOT in this list:
 * they carry a `.ics` attachment and their body is utilitarian (mail
 * clients render the calendar, not the body). Kept on hardcoded text.
 */

import type { BroadcastVariableKey } from './broadcasts';

interface EmailAction {
  key: string;
  label: string;
  description: string;
  /**
   * Variables the bound template is expected to use, as the admin API lists
   * them to an author. Other variables can still be referenced but render
   * empty.
   */
  variables: readonly BroadcastVariableKey[];
  /**
   * The subset without which the mail fails its purpose: a login code mail
   * with no code locks the person out, a refusal with no reason breaks RGPD
   * art. 12(4). `write_email_action` refuses a template missing one, and
   * refuses to leave such an action with no template.
   */
  requiredVariables: readonly BroadcastVariableKey[];
}

export const EMAIL_ACTIONS = {
  otp_talent: {
    key: 'otp_talent',
    label: 'Code OTP : Connexion talent',
    description:
      'Envoyé quand un talent demande un code de connexion depuis /login.',
    variables: ['prenom', 'otp_code'],
    requiredVariables: ['otp_code'],
  },
  otp_parent: {
    key: 'otp_parent',
    label: 'Code OTP : Connexion parent',
    description:
      'Envoyé quand un parent demande un code de connexion depuis /parent/login.',
    variables: ['parent_prenom', 'otp_code', 'login_link'],
    requiredVariables: ['otp_code'],
  },
  parent_welcome: {
    key: 'parent_welcome',
    label: 'Bienvenue parent',
    description:
      "Envoyé au parent quand son enfant termine l'onboarding. Préférez {{parent_fastlogin_link}} : lien magique qui ouvre l'espace parent sans code (le compte est provisionné au moment de l'envoi). {{login_link}} reste un repli vers la connexion par code.",
    variables: [
      'parent_prenom',
      'child_prenom',
      'parent_fastlogin_link',
      'login_link',
    ],
    requiredVariables: [],
  },
  relance_student: {
    key: 'relance_student',
    label: 'Relance : étudiant',
    description:
      "Envoyé par le staff dev pour pousser un étudiant à finaliser son onboarding. Le template fournit le brouillon initial (sujet + corps) ; le staff peut l'éditer avant envoi. {{jours_restants}} rend le compte à rebours (J-X) jusqu'au début du stage. Préférez {{fastlogin_link}} : lien magique qui le connecte et l'amène directement à son onboarding ; {{login_link}} reste un repli.",
    variables: [
      'prenom',
      'nom',
      'jours_restants',
      'fastlogin_link',
      'login_link',
    ],
    requiredVariables: [],
  },
  relance_parent: {
    key: 'relance_parent',
    label: 'Relance : parent',
    description:
      "Envoyé par le staff dev pour pousser un parent à renseigner le droit à l'image (autorisation ou refus). Brouillon éditable avant envoi. Préférez {{parent_fastlogin_link}} (connexion sans code) ; {{login_link}} reste un repli.",
    variables: [
      'parent_prenom',
      'parent_nom',
      'child_prenom',
      'parent_fastlogin_link',
      'login_link',
    ],
    requiredVariables: [],
  },
  account_deletion_refused: {
    key: 'account_deletion_refused',
    label: 'Suppression de compte : refus',
    description:
      "Envoyé au talent quand l'équipe refuse sa demande de suppression de compte. RGPD art. 12(4) : le corps DOIT donner le motif ({{deletion_reason}}) et rappeler le droit de réclamation auprès de la CNIL (cnil.fr).",
    variables: ['prenom', 'deletion_reason'],
    requiredVariables: ['deletion_reason'],
  },
  account_deletion_done: {
    key: 'account_deletion_done',
    label: 'Suppression de compte : confirmation',
    description:
      "Envoyé au talent au moment où l'équipe procède à l'effacement de son compte (anonymisation). Dernier message possible : son adresse est effacée juste après.",
    variables: ['prenom'],
    requiredVariables: [],
  },
} as const satisfies Record<string, EmailAction>;

export type EmailActionKey = keyof typeof EMAIL_ACTIONS;

export const EMAIL_ACTION_KEYS = Object.keys(
  EMAIL_ACTIONS,
) as readonly EmailActionKey[];

/** Whether a template's subject or body uses `{{variable}}`. */
export function templateUsesVariable(
  template: { subject: string | null; body: string },
  variable: BroadcastVariableKey,
): boolean {
  const token = `{{${variable}}}`;
  return template.body.includes(token) || !!template.subject?.includes(token);
}

/** The required variables of `action` that `template` does not use. */
export function missingRequiredVariables(
  action: EmailActionKey,
  template: { subject: string | null; body: string },
): BroadcastVariableKey[] {
  return EMAIL_ACTIONS[action].requiredVariables.filter(
    (variable) => !templateUsesVariable(template, variable),
  );
}
