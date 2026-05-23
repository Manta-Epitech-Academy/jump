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

export const parentTypeLabel = (value: string | null | undefined): string =>
  labelFrom(PARENT_TYPE_OPTIONS, value);
