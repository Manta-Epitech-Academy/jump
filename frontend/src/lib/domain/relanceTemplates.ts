/**
 * Shared shape passed between the relance compose dialog and its server
 * defaults loader. Content lives in MessageTemplate rows (bound via
 * EmailActionMapping for action keys `relance_student` / `relance_parent`)
 * — no hardcoded defaults here anymore; if no mapping exists, the dialog
 * shows the "non configuré" banner instead of misleading pre-fill.
 */

import type { RelanceType } from './relance';

export type RelanceTemplate = {
  subject: string;
  body: string;
};

/**
 * Default body for an SMS relance, per recipient type. SMS escalation is
 * fixed-shape (no admin template, no EmailActionMapping): a short, link-free
 * nudge that points back to the mailbox ({{email}}) — the SMS must never
 * carry an action link. `{{jours_restants}}` (days until the stage) is resolved
 * by the send action from the in-scope event, like every other token.
 */
export const RELANCE_SMS_DEFAULTS: Record<RelanceType, string> = {
  student:
    "Salut {{prenom}}, plus que {{jours_restants}} jours avant ton stage à Epitech ! Finalise vite ton inscription : on t'a envoyé un mail sur {{email}}. - Epitech {{campus}}",
  parent:
    "Bonjour, votre signature est attendue pour finaliser l'inscription de {{child_prenom}} au stage de seconde à Epitech. Mail envoyé sur {{email}}. - Epitech {{campus}}",
};
