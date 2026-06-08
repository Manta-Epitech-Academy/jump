/**
 * Canonical French labels for the profile vocabulary collected at onboarding
 * (talent + parents). Single source of truth so the onboarding form, the
 * Salesforce reconciliation page, and the enrichment export all render the same
 * labels. Keyed by the Zod enum strings in `validation/onboarding.ts`
 * (`civiliteEnum`, `parentTypeEnum`).
 */

export const CIVILITE_OPTIONS = [
  { value: 'homme', label: 'Homme' },
  { value: 'femme', label: 'Femme' },
  { value: 'autre', label: 'Autre' },
] as const;

export const PARENT_TYPE_OPTIONS = [
  { value: 'pere', label: 'Père' },
  { value: 'mere', label: 'Mère' },
  { value: 'referent', label: 'Référent légal' },
] as const;

function labelFrom(
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
): string {
  if (!value) return '';
  return options.find((o) => o.value === value)?.label ?? value;
}

export const civiliteLabel = (value: string | null | undefined): string =>
  labelFrom(CIVILITE_OPTIONS, value);

/**
 * Courtesy title (civilité) for display: the formal Monsieur/Madame rendering
 * of the gender enum. Distinct from CIVILITE_OPTIONS / civiliteLabel (the
 * onboarding selector labels Homme/Femme/Autre): `autre` and null have no
 * standard courtesy title, so they yield '' and callers omit the segment.
 */
export const civiliteCourtesyTitle = (
  value: string | null | undefined,
): string => {
  if (value === 'homme') return 'Monsieur';
  if (value === 'femme') return 'Madame';
  return '';
};

export const parentTypeLabel = (value: string | null | undefined): string =>
  labelFrom(PARENT_TYPE_OPTIONS, value);

/**
 * Maps the onboarding-collected guardian link (`parentType`) onto the exact
 * "agissant en qualité de" option used by the parent signature forms (`mère`,
 * `père`, `tuteur légal`, `tutrice légale`). A legal referent's gender comes
 * from `parentCivilite` so the tuteur/tutrice variant matches; returns `''`
 * when we lack the data, leaving the select unfilled.
 */
export const parentSignerRelationship = (
  parentType: string | null | undefined,
  parentCivilite: string | null | undefined,
): string => {
  switch (parentType) {
    case 'pere':
      return 'père';
    case 'mere':
      return 'mère';
    case 'referent':
      return parentCivilite === 'femme' ? 'tutrice légale' : 'tuteur légal';
    default:
      return '';
  }
};
