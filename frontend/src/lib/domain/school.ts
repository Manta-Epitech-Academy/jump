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

/**
 * Départements per académie, the administrative grouping of the éducation
 * nationale.
 *
 * A département answers "where do our talents come from"; an académie answers "who
 * do we negotiate with", because a rectorat is the counterpart for a partnership
 * covering several départements at once. The two are different questions, so the
 * platform answers both rather than leaving a reader to map one onto the other.
 *
 * Written académie-first because that is the direction a human checks it in, and
 * inverted once below. Reflects the post-2020 map: Caen and Rouen are one académie
 * (Normandie), and Corsica is one entry because `departementOf` cannot split 2A
 * from 2B out of a postal code.
 */
const DEPARTEMENTS_BY_ACADEMIE: Record<string, string[]> = {
  'Aix-Marseille': ['04', '05', '13', '84'],
  Amiens: ['02', '60', '80'],
  Besançon: ['25', '39', '70', '90'],
  Bordeaux: ['24', '33', '40', '47', '64'],
  'Clermont-Ferrand': ['03', '15', '43', '63'],
  Corse: ['20'],
  Créteil: ['77', '93', '94'],
  Dijon: ['21', '58', '71', '89'],
  Grenoble: ['07', '26', '38', '73', '74'],
  Lille: ['59', '62'],
  Limoges: ['19', '23', '87'],
  Lyon: ['01', '42', '69'],
  Montpellier: ['11', '30', '34', '48', '66'],
  'Nancy-Metz': ['54', '55', '57', '88'],
  Nantes: ['44', '49', '53', '72', '85'],
  Nice: ['06', '83'],
  Normandie: ['14', '27', '50', '61', '76'],
  'Orléans-Tours': ['18', '28', '36', '37', '41', '45'],
  Paris: ['75'],
  Poitiers: ['16', '17', '79', '86'],
  Reims: ['08', '10', '51', '52'],
  Rennes: ['22', '29', '35', '56'],
  Strasbourg: ['67', '68'],
  Toulouse: ['09', '12', '31', '32', '46', '65', '81', '82'],
  Versailles: ['78', '91', '92', '95'],
  Guadeloupe: ['971'],
  Martinique: ['972'],
  Guyane: ['973'],
  'La Réunion': ['974'],
  Mayotte: ['976'],
  'Wallis-et-Futuna': ['986'],
  'Polynésie française': ['987'],
  'Nouvelle-Calédonie': ['988'],
};

const ACADEMIE_BY_DEPARTEMENT = new Map(
  Object.entries(DEPARTEMENTS_BY_ACADEMIE).flatMap(([academie, departements]) =>
    departements.map((departement) => [departement, academie] as const),
  ),
);

/**
 * The académie a département belongs to, or null when there is no académie to name
 * (a null département, or a territory served by a vice-rectorat this table does not
 * cover, such as Saint-Pierre-et-Miquelon and the TAAF).
 *
 * Null rather than a plausible guess, same posture as Corsica in
 * {@link departementOf}: these figures get quoted to a rectorat, and a lycée
 * attributed to the wrong académie is worse than a lycée attributed to none.
 */
export function academieOf(
  departement: string | null | undefined,
): string | null {
  if (!departement) return null;
  return ACADEMIE_BY_DEPARTEMENT.get(departement) ?? null;
}
