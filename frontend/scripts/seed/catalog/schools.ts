/**
 * The lycées.
 *
 * `School` is UAI-keyed and resolved lazily from the éducation-nationale
 * annuaire in the running app, so only schools somebody actually attends ever
 * land in the table. The generator writes them directly, since the annuaire is
 * not reachable from a seed run.
 *
 * The distribution matters more than the names. In production, 432 of the 891
 * schools have exactly one talent and 20 have none at all: it is a long tail,
 * not a short list of feeder lycées. Anything that ranks schools, measures reach
 * or tracks churn is judged on that tail, so the generator reproduces the shape
 * and the scenarios attach talents unevenly.
 *
 * The UAI codes here are well-formed but fictional. Real ones identify real
 * establishments, and there is no reason for a development dataset to carry them.
 */

export type SchoolSpec = {
  readonly uai: string;
  readonly name: string;
  readonly city: string;
  readonly postalCode: string;
};

export const SCHOOLS: readonly SchoolSpec[] = [
  {
    uai: '0759001S',
    name: 'Lycée Voltaire',
    city: 'Paris',
    postalCode: '75011',
  },
  {
    uai: '0759002T',
    name: 'Lycée Hélène Boucher',
    city: 'Paris',
    postalCode: '75020',
  },
  {
    uai: '0759003U',
    name: 'Lycée Jacques Decour',
    city: 'Paris',
    postalCode: '75009',
  },
  {
    uai: '0139001V',
    name: 'Lycée Saint-Exupéry',
    city: 'Marseille',
    postalCode: '13015',
  },
  {
    uai: '0139002W',
    name: 'Lycée Marcel Pagnol',
    city: 'Marseille',
    postalCode: '13008',
  },
  { uai: '0699001X', name: 'Lycée Ampère', city: 'Lyon', postalCode: '69002' },
  {
    uai: '0699002Y',
    name: 'Lycée La Martinière',
    city: 'Villeurbanne',
    postalCode: '69100',
  },
  {
    uai: '0599001Z',
    name: 'Lycée Faidherbe',
    city: 'Lille',
    postalCode: '59000',
  },
  { uai: '0599002A', name: 'Lycée Baggio', city: 'Lille', postalCode: '59800' },
  {
    uai: '0449001B',
    name: 'Lycée Clemenceau',
    city: 'Nantes',
    postalCode: '44000',
  },
  {
    uai: '0679001C',
    name: 'Lycée Kléber',
    city: 'Strasbourg',
    postalCode: '67000',
  },
  {
    uai: '0359001D',
    name: 'Lycée Chateaubriand',
    city: 'Rennes',
    postalCode: '35000',
  },
  {
    uai: '0349001E',
    name: 'Lycée Joffre',
    city: 'Montpellier',
    postalCode: '34000',
  },
  { uai: '0069001F', name: 'Lycée Masséna', city: 'Nice', postalCode: '06000' },
  {
    uai: '9749001G',
    name: 'Lycée Leconte de Lisle',
    city: 'Saint-Denis',
    postalCode: '97400',
  },
  {
    uai: '0319001H',
    name: 'Lycée Pierre de Fermat',
    city: 'Toulouse',
    postalCode: '31000',
  },
  {
    uai: '0339001J',
    name: 'Lycée Montaigne',
    city: 'Bordeaux',
    postalCode: '33000',
  },
  {
    uai: '0689001K',
    name: 'Lycée Lambert',
    city: 'Mulhouse',
    postalCode: '68100',
  },
  {
    uai: '0549001L',
    name: 'Lycée Henri Poincaré',
    city: 'Nancy',
    postalCode: '54000',
  },
  {
    uai: '0039001M',
    name: 'Lycée Banville',
    city: 'Moulins',
    postalCode: '03000',
  },
  {
    uai: '0759004N',
    name: 'Collège Anne Frank',
    city: 'Paris',
    postalCode: '75011',
  },
  {
    uai: '0699003P',
    name: 'Collège Gilbert Dru',
    city: 'Lyon',
    postalCode: '69007',
  },
];

/**
 * A lycée with no UAI at all. Some students name a school the annuaire does not
 * know, and the app stores that as free text in `Talent.highSchoolNameManual`
 * instead of an FK. 57 talents are in that state in production, and every screen
 * that renders a school has to survive it.
 */
export const MANUAL_SCHOOL_NAMES = [
  'Lycée français de Casablanca',
  'Établissement privé hors contrat Descartes',
  'Scolarisation à domicile',
] as const;
