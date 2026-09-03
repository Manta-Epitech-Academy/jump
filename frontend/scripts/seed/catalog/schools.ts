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
 * ── Real names, fictional UAI ─────────────────────────────────────────────────
 *
 * The names and the communes are real, and they are annuaire data: which lycées
 * exist in Bordeaux, and what the INSEE and postal codes of a commune are, is
 * open data that says nothing about any person. It also has to be real, because
 * a lycée name is read on a fiche, in a school ranking and in a per-lycée
 * comparison - « Lycée 075-1000 » in « Commune 075 » made all three unreadable,
 * and a reader who cannot tell a plausible screen from a broken one cannot
 * validate anything on it.
 *
 * The UAI codes stay well-formed and invented, which is the one identifier that
 * does not follow. It is the key the app resolves an establishment BY, so a real
 * one in a development database is a row that could be mistaken for a live
 * annuaire record, or used to fetch one. The format is kept exact - department,
 * sequence, check letter - so anything parsing it works.
 */

export type SchoolSpec = {
  readonly uai: string;
  readonly name: string;
  /** Null for a fiche the annuaire answered incompletely. */
  readonly city: string | null;
  readonly postalCode: string | null;
  readonly inseeCode: string | null;
  /**
   * False for a school known only by a CRM reference, with no annuaire lookup
   * behind it yet. `resolvedAt` is nullable FOR that state and every screen
   * rendering a lycée has to survive it.
   */
  readonly resolved?: boolean;
};

/**
 * The head of the distribution: the lycées a campus actually sees several
 * students from, two or three per campus city.
 *
 * The two collèges are not decoration. 4,4% of talents are in 3eme and 0,8% in
 * 4eme, a collégien signs the RGPD charter and never a dossier, and « Lycée »
 * is the word every one of those screens says.
 */
export const SCHOOLS: readonly SchoolSpec[] = [
  // ── Paris ──
  {
    uai: '0759001S',
    name: 'Lycée Charlemagne',
    city: 'Paris',
    postalCode: '75004',
    inseeCode: '75104',
  },
  {
    uai: '0759002T',
    name: 'Lycée Jean-Baptiste Say',
    city: 'Paris',
    postalCode: '75016',
    inseeCode: '75116',
  },
  {
    uai: '0759003U',
    name: 'Lycée privé Massillon',
    city: 'Paris',
    postalCode: '75004',
    inseeCode: '75104',
  },
  {
    uai: '0759004N',
    name: 'Collège Anne Frank',
    city: 'Paris',
    postalCode: '75011',
    inseeCode: '75111',
  },
  // ── Marseille ──
  {
    uai: '0139001V',
    name: 'Lycée Thiers',
    city: 'Marseille',
    postalCode: '13232',
    inseeCode: '13201',
  },
  {
    uai: '0139002W',
    name: 'Lycée Lacordaire',
    city: 'Marseille',
    postalCode: '13013',
    inseeCode: '13213',
  },
  {
    uai: '0139003X',
    name: 'Lycée polyvalent Antonin Artaud',
    city: 'Marseille',
    postalCode: '13013',
    inseeCode: '13213',
  },
  // ── Lyon ──
  {
    uai: '0699001X',
    name: 'Lycée du Parc',
    city: 'Lyon',
    postalCode: '69006',
    inseeCode: '69386',
  },
  {
    uai: '0699002Y',
    name: 'Lycée Antoine de Saint-Exupéry',
    city: 'Lyon',
    postalCode: '69316',
    inseeCode: '69384',
  },
  {
    uai: '0699003P',
    name: 'Collège Charles de Foucauld',
    city: 'Lyon',
    postalCode: '69003',
    inseeCode: '69383',
  },
  {
    uai: '0699004Q',
    name: 'Lycée Gilberte et Pierre Brossolette',
    city: 'Villeurbanne',
    postalCode: '69100',
    inseeCode: '69266',
  },
  // ── Lille ──
  {
    uai: '0599001Z',
    name: 'Lycée Louis Pasteur',
    city: 'Lille',
    postalCode: '59000',
    inseeCode: '59350',
  },
  {
    uai: '0599002A',
    name: 'Lycée Ozanam',
    city: 'Lille',
    postalCode: '59045',
    inseeCode: '59350',
  },
  {
    uai: '0599003B',
    name: 'Lycée polyvalent Colbert',
    city: 'Tourcoing',
    postalCode: '59208',
    inseeCode: '59599',
  },
  // ── Nantes ──
  {
    uai: '0449001B',
    name: 'Lycée Livet',
    city: 'Nantes',
    postalCode: '44042',
    inseeCode: '44109',
  },
  {
    uai: '0449002C',
    name: 'Lycée Blanche de Castille',
    city: 'Nantes',
    postalCode: '44319',
    inseeCode: '44109',
  },
  {
    uai: '0449003D',
    name: 'Lycée polyvalent Nicolas Appert',
    city: 'Orvault',
    postalCode: '44700',
    inseeCode: '44114',
  },
  // ── Strasbourg ──
  {
    uai: '0679001C',
    name: 'Lycée International les Pontonniers',
    city: 'Strasbourg',
    postalCode: '67017',
    inseeCode: '67482',
  },
  {
    uai: '0679002D',
    name: 'Lycée polyvalent Jean Rostand',
    city: 'Strasbourg',
    postalCode: '67084',
    inseeCode: '67482',
  },
  {
    uai: '0679003E',
    name: 'Lycée polyvalent Marcel Rudloff',
    city: 'Strasbourg',
    postalCode: '67200',
    inseeCode: '67482',
  },
  // ── Rennes ──
  {
    uai: '0359001D',
    name: 'Lycée Joliot Curie',
    city: 'Rennes',
    postalCode: '35703',
    inseeCode: '35238',
  },
  {
    uai: '0359002E',
    name: 'Lycée polyvalent Pierre Mendès France',
    city: 'Rennes',
    postalCode: '35069',
    inseeCode: '35238',
  },
  {
    uai: '0359003F',
    name: 'Lycée polyvalent Marcel Callo',
    city: 'Redon',
    postalCode: '35603',
    inseeCode: '35236',
  },
  // ── Montpellier ──
  {
    uai: '0349001E',
    name: 'Lycée Joffre',
    city: 'Montpellier',
    postalCode: '34060',
    inseeCode: '34172',
  },
  {
    uai: '0349002F',
    name: 'Lycée polyvalent Jules Guesde',
    city: 'Montpellier',
    postalCode: '34060',
    inseeCode: '34172',
  },
  {
    uai: '0349003G',
    name: 'Lycée privé Notre-Dame de la Merci',
    city: 'Montpellier',
    postalCode: '34965',
    inseeCode: '34172',
  },
  // ── Nice ──
  {
    uai: '0069001F',
    name: 'Lycée Honoré d’Estienne d’Orves',
    city: 'Nice',
    postalCode: '06050',
    inseeCode: '06088',
  },
  {
    uai: '0069002G',
    name: 'Lycée Guillaume Apollinaire',
    city: 'Nice',
    postalCode: '06300',
    inseeCode: '06088',
  },
  {
    uai: '0069003H',
    name: 'Lycée Mélinée et Missak Manouchian',
    city: 'Nice',
    postalCode: '06200',
    inseeCode: '06088',
  },
  // ── La Réunion ──
  {
    uai: '9749001G',
    name: 'Lycée général et technologique Leconte de Lisle',
    city: 'Saint-Denis',
    postalCode: '97490',
    inseeCode: '97411',
  },
  {
    uai: '9749002H',
    name: 'Lycée polyvalent Georges Brassens',
    city: 'Saint-Denis',
    postalCode: '97493',
    inseeCode: '97411',
  },
  {
    uai: '9749003J',
    name: 'Lycée général et technologique Ambroise Vollard',
    city: 'Saint-Pierre',
    postalCode: '97448',
    inseeCode: '97416',
  },
  // ── Toulouse ──
  {
    uai: '0319001H',
    name: 'Lycée général Pierre de Fermat',
    city: 'Toulouse',
    postalCode: '31010',
    inseeCode: '31555',
  },
  {
    uai: '0319002J',
    name: 'Lycée polyvalent Bellevue',
    city: 'Toulouse',
    postalCode: '31031',
    inseeCode: '31555',
  },
  {
    uai: '0319003K',
    name: 'Lycée général et technologique Henri de Toulouse-Lautrec',
    city: 'Toulouse',
    postalCode: '31020',
    inseeCode: '31555',
  },
  // ── Bordeaux ──
  {
    uai: '0339001J',
    name: 'Lycée Michel Montaigne',
    city: 'Bordeaux',
    postalCode: '33075',
    inseeCode: '33063',
  },
  {
    uai: '0339002K',
    name: 'Lycée Montesquieu',
    city: 'Bordeaux',
    postalCode: '33029',
    inseeCode: '33063',
  },
  {
    uai: '0339003L',
    name: 'Lycée polyvalent Gustave Eiffel',
    city: 'Bordeaux',
    postalCode: '33074',
    inseeCode: '33063',
  },
  // ── Mulhouse ──
  {
    uai: '0689001K',
    name: 'Lycée Albert Schweitzer',
    city: 'Mulhouse',
    postalCode: '68068',
    inseeCode: '68224',
  },
  {
    uai: '0689002L',
    name: 'Lycée Louis Armand',
    city: 'Mulhouse',
    postalCode: '68058',
    inseeCode: '68224',
  },
  {
    uai: '0689003M',
    name: 'Lycée polyvalent Jean Mermoz',
    city: 'Saint-Louis',
    postalCode: '68300',
    inseeCode: '68297',
  },
  // ── Nancy ──
  {
    uai: '0549001L',
    name: 'Lycée Henri Loritz',
    city: 'Nancy',
    postalCode: '54042',
    inseeCode: '54395',
  },
  {
    uai: '0549002M',
    name: 'Lycée Frédéric Chopin',
    city: 'Nancy',
    postalCode: '54042',
    inseeCode: '54395',
  },
  {
    uai: '0549003N',
    name: 'Lycée La Malgrange',
    city: 'Jarville-la-Malgrange',
    postalCode: '54140',
    inseeCode: '54274',
  },
  // ── Moulins ──
  {
    uai: '0039001M',
    name: 'Lycée Théodore de Banville',
    city: 'Moulins',
    postalCode: '03000',
    inseeCode: '03190',
  },
  {
    uai: '0039002N',
    name: 'Lycée Anna Rodier',
    city: 'Moulins',
    postalCode: '03000',
    inseeCode: '03190',
  },

  // ── The two incomplete fiches ──
  //
  // The annuaire does not always answer in full, and production carries a
  // school whose ville and codes are empty. Every screen rendering a lycée has
  // to survive it, and it is the only row that gives `School.city`,
  // `postalCode` and `inseeCode` a null anywhere in the dataset.
  {
    uai: '0139004Y',
    name: 'Lycée professionnel privé Modèle Électronique',
    city: null,
    postalCode: null,
    inseeCode: null,
  },
  // And one known only by the reference the CRM sent, never looked up. That is
  // what `resolvedAt` is nullable for: a school arrives from an enrolment and
  // the annuaire call happens later, or not at all.
  {
    uai: '0759005V',
    name: 'Lycée Voltaire',
    city: 'Paris',
    postalCode: '75011',
    inseeCode: '75111',
    resolved: false,
  },
];

/**
 * Communes the tail is spread over: real, with their real postal and INSEE
 * codes, across the departments the fifteen campuses recruit in.
 *
 * The two codes are NOT the same number and were being written as one - the
 * generator copied `postalCode` into `inseeCode`, which is a value no annuaire
 * ever returns. Nancy is postal 54000 and INSEE 54395.
 */
const COMMUNES: readonly {
  readonly city: string;
  readonly postalCode: string;
  readonly inseeCode: string;
}[] = [
  { city: 'Paris', postalCode: '75009', inseeCode: '75109' },
  { city: 'Paris', postalCode: '75005', inseeCode: '75105' },
  { city: 'Vanves', postalCode: '92170', inseeCode: '92075' },
  { city: 'Pantin', postalCode: '93500', inseeCode: '93055' },
  { city: 'Maisons-Alfort', postalCode: '94700', inseeCode: '94046' },
  { city: 'Marseille', postalCode: '13008', inseeCode: '13208' },
  { city: 'Aix-en-Provence', postalCode: '13100', inseeCode: '13001' },
  { city: 'Gardanne', postalCode: '13120', inseeCode: '13041' },
  { city: 'Salon-de-Provence', postalCode: '13657', inseeCode: '13103' },
  { city: 'Lyon', postalCode: '69007', inseeCode: '69387' },
  { city: 'Villeurbanne', postalCode: '69613', inseeCode: '69266' },
  { city: 'Villefranche-sur-Saône', postalCode: '69665', inseeCode: '69264' },
  { city: 'Tourcoing', postalCode: '59208', inseeCode: '59599' },
  { city: 'Valenciennes', postalCode: '59307', inseeCode: '59606' },
  { city: 'Dunkerque', postalCode: '59640', inseeCode: '59183' },
  { city: 'Saint-Herblain', postalCode: '44800', inseeCode: '44162' },
  { city: 'Savenay', postalCode: '44260', inseeCode: '44184' },
  {
    city: 'Saint-Sébastien-sur-Loire',
    postalCode: '44232',
    inseeCode: '44190',
  },
  { city: 'Strasbourg', postalCode: '67000', inseeCode: '67482' },
  { city: 'Haguenau', postalCode: '67504', inseeCode: '67180' },
  { city: 'Wissembourg', postalCode: '67163', inseeCode: '67544' },
  { city: 'Cesson-Sévigné', postalCode: '35577', inseeCode: '35051' },
  { city: 'Saint-Malo', postalCode: '35400', inseeCode: '35288' },
  { city: 'Vitré', postalCode: '35500', inseeCode: '35360' },
  { city: 'Castelnau-le-Lez', postalCode: '34170', inseeCode: '34057' },
  { city: 'Lunel', postalCode: '34401', inseeCode: '34145' },
  { city: 'Agde', postalCode: '34304', inseeCode: '34003' },
  { city: 'Antibes', postalCode: '06600', inseeCode: '06004' },
  { city: 'Cannes', postalCode: '06414', inseeCode: '06029' },
  { city: 'Cagnes-sur-Mer', postalCode: '06802', inseeCode: '06027' },
  { city: 'Sainte-Marie', postalCode: '97438', inseeCode: '97413' },
  { city: 'Saint-Benoît', postalCode: '97437', inseeCode: '97410' },
  { city: 'Le Tampon', postalCode: '97430', inseeCode: '97422' },
  { city: 'Blagnac', postalCode: '31700', inseeCode: '31069' },
  { city: 'Saint-Orens-de-Gameville', postalCode: '31671', inseeCode: '31506' },
  { city: 'Pibrac', postalCode: '31820', inseeCode: '31417' },
  { city: 'Libourne', postalCode: '33505', inseeCode: '33243' },
  { city: 'Blanquefort', postalCode: '33290', inseeCode: '33056' },
  { city: 'Bazas', postalCode: '33430', inseeCode: '33036' },
  { city: 'Saint-Louis', postalCode: '68300', inseeCode: '68297' },
  { city: 'Colmar', postalCode: '68000', inseeCode: '68066' },
  { city: 'Vandoeuvre-lès-Nancy', postalCode: '54500', inseeCode: '54547' },
  { city: 'Pont-à-Mousson', postalCode: '54701', inseeCode: '54431' },
  { city: 'Metz', postalCode: '57000', inseeCode: '57463' },
  { city: 'Vichy', postalCode: '03200', inseeCode: '03310' },
  { city: 'Montluçon', postalCode: '03100', inseeCode: '03185' },
];

/**
 * The kinds, at roughly the share the annuaire returns them in: 466 plain
 * lycées, 181 polyvalents, then the private and the professionnels, and a
 * handful of collèges.
 */
const KINDS = [
  'Lycée',
  'Lycée',
  'Lycée',
  'Lycée polyvalent',
  'Lycée général et technologique',
  'Lycée privé',
  'Lycée général',
  'Lycée professionnel',
  'Collège',
] as const;

/**
 * Who French lycées are named after. Taken from the annuaire, most-used first -
 * six establishments in production are a « Marie Curie » and six a « Jean
 * Monnet », so a repeated eponym across two communes is the real thing rather
 * than a collision to design around.
 */
const EPONYMS = [
  'Marie Curie',
  'Jean Monnet',
  'Simone Veil',
  'Paul Langevin',
  'Victor Hugo',
  'René Cassin',
  'Pierre Mendès France',
  'Montesquieu',
  'Louis Pasteur',
  'Léonard de Vinci',
  'Jules Ferry',
  'Jeanne d’Arc',
  'Jean Jaurès',
  'Gustave Eiffel',
  'Frédéric Ozanam',
  'Nelson Mandela',
  'Marcelin Berthelot',
  'Louis Armand',
  'Jules Verne',
  'Jean Perrin',
  'Édouard Branly',
  'Condorcet',
  'Colbert',
  'Charles de Foucauld',
  'Blaise Pascal',
  'Ampère',
  'Voltaire',
  'Stéphane Hessel',
  'Madame de Sévigné',
  'Robert Schuman',
  'René Descartes',
  'Rabelais',
  'Albert Camus',
  'Antoine de Saint-Exupéry',
  'Rosa Parks',
  'Jean Moulin',
  'Jean Rostand',
  'Paul Éluard',
  'Germaine Tillion',
  'Camille Claudel',
  'Alexandre Dumas',
  'Georges Brassens',
  'Honoré de Balzac',
  'Le Corbusier',
  'Emilie du Châtelet',
  'Sophie Germain',
  'Théodore Monod',
  'Notre-Dame',
] as const;

/**
 * The UAI's trailing check character. Real ones never use I, O or Q - the
 * letters that read as 1 and 0 - and neither do the 891 in production.
 */
const UAI_CHECK_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

/**
 * The tail.
 *
 * The named list above is the head of the distribution: the lycées a campus
 * actually sees several students from. Production carries 891 schools, and 432
 * of them have exactly one talent - anything measuring school reach, or lycée
 * churn between two years, is judged on that tail rather than on the head.
 *
 * Composed rather than listed, because a `staging` run needs 830 of them and no
 * literal list is going to be maintained at that length. Composed from REAL
 * parts, though, which is the whole difference: a kind, an eponym and a commune
 * the annuaire actually returns, so every row reads like a school somebody
 * attends. It was `Lycée 075-1000` in `Commune 075`, which is unreadable on a
 * fiche and worse on a per-lycée comparison - the one screen whose entire
 * content is these names.
 *
 * The three strides are coprime with their pool lengths, so the kind, the
 * eponym and the commune each cycle independently instead of moving in
 * lockstep: 48 eponyms over 46 communes is what stops the list reading as a
 * table nobody shuffled.
 */
export function tailSchools(count: number): SchoolSpec[] {
  const out: SchoolSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    const commune = COMMUNES[i % COMMUNES.length]!;
    const kind = KINDS[(i * 2) % KINDS.length]!;
    const eponym = EPONYMS[(i * 7) % EPONYMS.length]!;
    // The department, then a sequence and a check letter: the UAI's own shape.
    // Overseas departments carry three digits of it, metropolitan ones two, so
    // the prefix comes off the INSEE code rather than being padded blindly.
    const department = commune.inseeCode.startsWith('97')
      ? commune.inseeCode.slice(0, 3)
      : `0${commune.inseeCode.slice(0, 2)}`;
    // Four digits, and the sequence carries the whole index so the UAI is
    // unique whatever the commune and the letter do. The head above sits in the
    // 9000s, which is what keeps the two ranges apart.
    const sequence = String(1000 + i).padStart(4, '0');
    out.push({
      uai: `${department}${sequence}${UAI_CHECK_LETTERS[i % UAI_CHECK_LETTERS.length]}`,
      name: `${kind} ${eponym}`,
      city: commune.city,
      postalCode: commune.postalCode,
      inseeCode: commune.inseeCode,
    });
  }
  return out;
}

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
