/**
 * The campuses, with the weights PROFILE.md measured.
 *
 * The order is the real one, busiest first, and the weights are the real share
 * of enrolments. Both matter more than they look. Fifteen equal campuses would
 * be as false as a single one: the inequality is what makes a cross-campus
 * comparison mean something, and it is what pushes the small campuses under the
 * five-actor floor the usage figures mask below. Moulins exists in this list for
 * exactly that reason.
 *
 * There is deliberately no `externalName` here. That column is what the worker
 * resolves a campus by, so leaving it unset is what keeps a seeded database out
 * of every sync's scope: `/api/worker/config` serves no source whose campus
 * lacks one. See `World.addCampus` and `assert/coverage.ts`. These campuses
 * carry real names because a screen has to read like the real thing; they are
 * not the real campuses, and nothing here comes from Salesforce.
 */

export type CampusSpec = {
  readonly name: string;
  readonly timezone: string;
  /**
   * INSEE code of the département, which gives the calendar its school holiday
   * zone and public holiday regime. Placed, not drawn: the set below spans the
   * three zones, Alsace-Moselle (Strasbourg, Mulhouse) and an overseas
   * département (La Réunion), and Marseille carries none.
   */
  readonly departement: string | null;
  /** Relative share of the platform's enrolments, from PROFILE.md. */
  readonly weight: number;
  /**
   * False for a campus that has published no contact address. Declared here
   * rather than derived in `World.addCampus`, because which campuses are
   * incomplete is a property of the catalogue and not of the writer - and a
   * rule keyed on a name that a small profile never reaches silently stops
   * applying.
   */
  readonly withContactEmail?: boolean;
};

export const CAMPUSES: readonly CampusSpec[] = [
  { name: 'Paris', timezone: 'Europe/Paris', departement: '75', weight: 1372 },
  // No contact address published. Every screen offering « contacter le campus »
  // has to cope with that, and it is the second campus of every profile, so the
  // case is present even in CI. No département either, for the same reason: its
  // calendar shows no holidays, the state of every production campus until an
  // admin fills it in.
  {
    name: 'Marseille',
    timezone: 'Europe/Paris',
    departement: null,
    weight: 944,
    withContactEmail: false,
  },
  { name: 'Lyon', timezone: 'Europe/Paris', departement: '69', weight: 679 },
  { name: 'Lille', timezone: 'Europe/Paris', departement: '59', weight: 556 },
  { name: 'Nantes', timezone: 'Europe/Paris', departement: '44', weight: 506 },
  {
    name: 'Strasbourg',
    timezone: 'Europe/Paris',
    departement: '67',
    weight: 480,
  },
  { name: 'Rennes', timezone: 'Europe/Paris', departement: '35', weight: 475 },
  {
    name: 'Montpellier',
    timezone: 'Europe/Paris',
    departement: '34',
    weight: 464,
  },
  { name: 'Nice', timezone: 'Europe/Paris', departement: '06', weight: 433 },
  // The one campus that is not on metropolitan time. It is in the list on
  // purpose: a wall-clock bug in the planning or the émargement only shows up
  // against a campus four hours off the others.
  {
    name: 'La Réunion',
    timezone: 'Indian/Reunion',
    departement: '974',
    weight: 407,
  },
  {
    name: 'Toulouse',
    timezone: 'Europe/Paris',
    departement: '31',
    weight: 404,
  },
  {
    name: 'Bordeaux',
    timezone: 'Europe/Paris',
    departement: '33',
    weight: 354,
  },
  {
    name: 'Mulhouse',
    timezone: 'Europe/Paris',
    departement: '68',
    weight: 291,
  },
  { name: 'Nancy', timezone: 'Europe/Paris', departement: '54', weight: 223 },
  // Smallest by an order of magnitude: 6 events, 50 enrolments, one staff
  // member. The campus that makes a per-campus screen prove it degrades.
  { name: 'Moulins', timezone: 'Europe/Paris', departement: '03', weight: 50 },
];
