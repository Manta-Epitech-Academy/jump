/**
 * Catalogue of the talent profile fields reconciled between Jump's confirmed
 * truth and Salesforce's last claim. Pure domain data (no DB, no server deps),
 * so it is safe to import from both the server reconciliation service and the
 * client-side admin page.
 */

const DIFF_FIELDS = ['nom', 'prenom', 'phone', 'civilite', 'school'] as const;
export type DiffField = (typeof DIFF_FIELDS)[number];

export function isDiffField(value: unknown): value is DiffField {
  return (DIFF_FIELDS as readonly unknown[]).includes(value);
}

/**
 * French labels for the reconcilable fields. Single source shared by the
 * on-screen page and the CSV export, so a renamed field reads identically on
 * both surfaces.
 */
export const FIELD_LABELS: Record<DiffField, string> = {
  nom: 'Nom',
  prenom: 'Prénom',
  phone: 'Téléphone',
  civilite: 'Civilité',
  school: 'Lycée',
};
