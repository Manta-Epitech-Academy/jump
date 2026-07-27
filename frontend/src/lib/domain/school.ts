/**
 * Reading a French département out of a school's postal code.
 *
 * `School` rows are enriched from the éducation-nationale annuaire, which gives
 * a postal code but no département, and territorial reach ("how many
 * départements do we actually touch") is a question the platform can answer
 * cheaply from what it already stores. So the derivation lives here, next to the
 * rest of the school vocabulary, rather than inside the one aggregate that needs
 * it today.
 */

/**
 * The département a postal code belongs to, or null when the code is missing or
 * malformed (an unresolved `School` row has no postal code at all).
 *
 * Overseas codes are three digits (971 Guadeloupe ... 976 Mayotte, 984/986-988
 * for the collectivities), metropolitan ones two.
 *
 * Corsica is reported as "20" rather than 2A / 2B: the split is not derivable
 * from a postal code without a commune-by-commune table, and inventing a
 * plausible answer is worse than a slightly coarse one, in a figure somebody
 * will quote.
 */
export function departementOf(
  postalCode: string | null | undefined,
): string | null {
  const digits = (postalCode ?? '').replace(/\D/g, '');
  if (digits.length < 5) return null;
  return digits.startsWith('97') || digits.startsWith('98')
    ? digits.slice(0, 3)
    : digits.slice(0, 2);
}
