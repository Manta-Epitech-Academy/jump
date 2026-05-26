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
 * nudge that names the mailbox to check ({{email}}) per the spec — the SMS
 * must never carry an action link. Staff can still tweak the wording in the
 * compose dialog before sending; this is just the pre-fill.
 */
export const RELANCE_SMS_DEFAULTS: Record<RelanceType, string> = {
  student:
    "Salut {{prenom}} ! Un email Jump (Epitech) t'attend sur {{email}} pour finaliser ton inscription. Pense a verifier tes spams.",
  parent:
    "Bonjour, un email Jump (Epitech) vous attend sur {{email}} pour la signature du droit a l'image de {{child_prenom}}. Pensez a verifier vos spams.",
};
