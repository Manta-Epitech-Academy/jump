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
 * nationale, each with its name.
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
 *
 * The name is what tells a reader which département a code is: the académie alone
 * reads as a city, and it names 67 and 68 alike.
 */
const DEPARTEMENTS_BY_ACADEMIE: Record<string, Record<string, string>> = {
  'Aix-Marseille': {
    '04': 'Alpes-de-Haute-Provence',
    '05': 'Hautes-Alpes',
    '13': 'Bouches-du-Rhône',
    '84': 'Vaucluse',
  },
  Amiens: { '02': 'Aisne', '60': 'Oise', '80': 'Somme' },
  Besançon: {
    '25': 'Doubs',
    '39': 'Jura',
    '70': 'Haute-Saône',
    '90': 'Territoire de Belfort',
  },
  Bordeaux: {
    '24': 'Dordogne',
    '33': 'Gironde',
    '40': 'Landes',
    '47': 'Lot-et-Garonne',
    '64': 'Pyrénées-Atlantiques',
  },
  'Clermont-Ferrand': {
    '03': 'Allier',
    '15': 'Cantal',
    '43': 'Haute-Loire',
    '63': 'Puy-de-Dôme',
  },
  Corse: { '20': 'Corse' },
  Créteil: {
    '77': 'Seine-et-Marne',
    '93': 'Seine-Saint-Denis',
    '94': 'Val-de-Marne',
  },
  Dijon: {
    '21': "Côte-d'Or",
    '58': 'Nièvre',
    '71': 'Saône-et-Loire',
    '89': 'Yonne',
  },
  Grenoble: {
    '07': 'Ardèche',
    '26': 'Drôme',
    '38': 'Isère',
    '73': 'Savoie',
    '74': 'Haute-Savoie',
  },
  Lille: { '59': 'Nord', '62': 'Pas-de-Calais' },
  Limoges: { '19': 'Corrèze', '23': 'Creuse', '87': 'Haute-Vienne' },
  Lyon: { '01': 'Ain', '42': 'Loire', '69': 'Rhône' },
  Montpellier: {
    '11': 'Aude',
    '30': 'Gard',
    '34': 'Hérault',
    '48': 'Lozère',
    '66': 'Pyrénées-Orientales',
  },
  'Nancy-Metz': {
    '54': 'Meurthe-et-Moselle',
    '55': 'Meuse',
    '57': 'Moselle',
    '88': 'Vosges',
  },
  Nantes: {
    '44': 'Loire-Atlantique',
    '49': 'Maine-et-Loire',
    '53': 'Mayenne',
    '72': 'Sarthe',
    '85': 'Vendée',
  },
  Nice: { '06': 'Alpes-Maritimes', '83': 'Var' },
  Normandie: {
    '14': 'Calvados',
    '27': 'Eure',
    '50': 'Manche',
    '61': 'Orne',
    '76': 'Seine-Maritime',
  },
  'Orléans-Tours': {
    '18': 'Cher',
    '28': 'Eure-et-Loir',
    '36': 'Indre',
    '37': 'Indre-et-Loire',
    '41': 'Loir-et-Cher',
    '45': 'Loiret',
  },
  Paris: { '75': 'Paris' },
  Poitiers: {
    '16': 'Charente',
    '17': 'Charente-Maritime',
    '79': 'Deux-Sèvres',
    '86': 'Vienne',
  },
  Reims: { '08': 'Ardennes', '10': 'Aube', '51': 'Marne', '52': 'Haute-Marne' },
  Rennes: {
    '22': "Côtes-d'Armor",
    '29': 'Finistère',
    '35': 'Ille-et-Vilaine',
    '56': 'Morbihan',
  },
  Strasbourg: { '67': 'Bas-Rhin', '68': 'Haut-Rhin' },
  Toulouse: {
    '09': 'Ariège',
    '12': 'Aveyron',
    '31': 'Haute-Garonne',
    '32': 'Gers',
    '46': 'Lot',
    '65': 'Hautes-Pyrénées',
    '81': 'Tarn',
    '82': 'Tarn-et-Garonne',
  },
  Versailles: {
    '78': 'Yvelines',
    '91': 'Essonne',
    '92': 'Hauts-de-Seine',
    '95': "Val-d'Oise",
  },
  Guadeloupe: { '971': 'Guadeloupe' },
  Martinique: { '972': 'Martinique' },
  Guyane: { '973': 'Guyane' },
  'La Réunion': { '974': 'La Réunion' },
  Mayotte: { '976': 'Mayotte' },
  'Wallis-et-Futuna': { '986': 'Wallis-et-Futuna' },
  'Polynésie française': { '987': 'Polynésie française' },
  'Nouvelle-Calédonie': { '988': 'Nouvelle-Calédonie' },
};

const ACADEMIE_BY_DEPARTEMENT = new Map(
  Object.entries(DEPARTEMENTS_BY_ACADEMIE).flatMap(([academie, departements]) =>
    Object.keys(departements).map(
      (departement) => [departement, academie] as const,
    ),
  ),
);

const NAME_BY_DEPARTEMENT = new Map(
  Object.values(DEPARTEMENTS_BY_ACADEMIE).flatMap((departements) =>
    Object.entries(departements),
  ),
);

/**
 * Every département an académie answers for, in code order ("01" ... "988",
 * Corsica as "20"). The values a campus's `departement` may take: a code this
 * table does not know has no académie, so nothing could be derived from it.
 */
export const DEPARTEMENTS: readonly string[] = [
  ...ACADEMIE_BY_DEPARTEMENT.keys(),
].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

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

/**
 * The name of a département ("Bas-Rhin" for "67"), or null for a code this table
 * does not know, the same codes {@link academieOf} answers null for.
 */
export function departementName(
  departement: string | null | undefined,
): string | null {
  if (!departement) return null;
  return NAME_BY_DEPARTEMENT.get(departement) ?? null;
}
