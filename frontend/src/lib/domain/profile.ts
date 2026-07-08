/**
 * Canonical French labels for the profile vocabulary collected at onboarding
 * (talent + parents). Single source of truth so the onboarding form, the
 * Salesforce reconciliation page, and the enrichment export all render the same
 * labels. Keyed by the Zod enum strings in `validation/onboarding.ts`
 * (`civiliteEnum`, `parentTypeEnum`).
 */

/**
 * Title-cases a given name for display: every space / hyphen / apostrophe
 * delimited segment gets an uppercase initial and a lowercase tail, so a value
 * stored as "MARIE" renders "Marie", "jean-pierre" renders "Jean-Pierre" and
 * "anne sophie" renders "Anne Sophie". Unicode- and accent-aware.
 *
 * Names are persisted exactly as the student or Salesforce supplied them (often
 * ALL CAPS); this is a pure display projection, never written back, so the raw
 * value stays the truth that Salesforce reconciliation compares against. It also
 * replaces the naive `capitalize`, which lowercased everything after the first
 * letter and so flattened "Jean-Pierre" to "Jean-pierre". Surnames are rendered
 * uppercase by their own surface (CSS in <TalentName>, `formatFamilyName` below),
 * so only the given name needs this.
 */
export function formatGivenName(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLocaleLowerCase('fr')
    .replace(
      /(^|[\s\-'’])(\p{L})/gu,
      (_match, sep, ch) => sep + ch.toLocaleUpperCase('fr'),
    );
}

/**
 * Uppercases a surname for display (French civil convention: "Dupont" → "DUPONT").
 * Locale-aware so accented letters case correctly ("é" → "É"). Like
 * formatGivenName, a pure display projection over the raw stored value, never
 * written back. Use formatGivenName instead where the surname sits in a
 * salutation rather than a list ("Bonjour Mr/Mme Dupont,", not "DUPONT").
 */
function formatFamilyName(value: string | null | undefined): string {
  return value ? value.toLocaleUpperCase('fr') : '';
}

/**
 * Person name as a plain string with the surname uppercased, matching the
 * <TalentName> component and the talent profile hero. Use this only where
 * markup is impossible (document titles, breadcrumb labels passed as strings);
 * anywhere an element can render, prefer <TalentName>. `order` mirrors the
 * component's: 'surname-first' ("DUPONT Marie") for scannable lists,
 * 'given-first' ("Marie DUPONT") for civil identity.
 */
export function formatPersonName(
  prenom: string | null | undefined,
  nom: string | null | undefined,
  order: 'given-first' | 'surname-first' = 'given-first',
): string {
  const given = formatGivenName(prenom);
  const family = formatFamilyName(nom);
  const parts = order === 'surname-first' ? [family, given] : [given, family];
  return parts.filter(Boolean).join(' ');
}

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
