/**
 * Shared shape passed between the relance compose dialog and its server
 * defaults loader. Content lives in MessageTemplate rows (bound via
 * EmailActionMapping for action keys `relance_student` / `relance_parent`)
 * — no hardcoded defaults here anymore; if no mapping exists, the dialog
 * shows the "non configuré" banner instead of misleading pre-fill.
 */

export type RelanceTemplate = {
  subject: string;
  body: string;
};
