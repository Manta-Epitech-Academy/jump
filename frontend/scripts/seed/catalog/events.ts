/**
 * How an event is named.
 *
 * `Event.titre` is Salesforce's, and it is not a title anybody sat down and
 * chose: the CRM builds it out of the campaign, so all 292 of production's
 * events read `Coding Club - <campus> - <YYYY/MM/DD>` - optionally followed by
 * whatever the campus typed into the campaign name - or `STAGE - <campus> -
 * <YYYY/MM/DD> - stage seconde`. There is no third shape.
 *
 * That matters more than it looks, because 219 of those events carry no
 * `publicName`, and `eventDisplayName` falls back to `titre`: the CRM string is
 * what staff actually read on most screens, most of the time. An invented one
 * (« Journée découverte Lyon #4 ») is therefore not a cosmetic liberty - it
 * makes every list in the dev space look like a product nobody has ever synced,
 * which is the one thing a validation environment is for.
 *
 * `publicName` is the campus's own, typed on the configuration screen and shown
 * to talents. Production's are short and seasonal (`Summer Camp`, `Winter
 * Camp`, `Back to Epitech`, `Coding Club - Octobre 2025`, `Stage de Seconde`),
 * which is the second half of the pattern: the format and the date sit in the
 * title, the season in the public name.
 *
 * Nothing here is stored. `Event.eventType` was deleted on purpose - an event
 * is what its modules and its dates say it is - and these are naming functions
 * a scenario calls, not a type an event carries.
 */

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

const pad2 = (value: number) => String(value).padStart(2, '0');

/**
 * `2026/03/14`: the date, the way the CRM writes one into a campaign name.
 *
 * Read in UTC, like every other date this generator handles. The day markers
 * `World.eventWindow` produces are UTC midnights, so there is no timezone
 * question to get wrong here - and the campaign name is a string the CRM
 * composed once, not a value anybody re-reads per campus.
 */
function crmDate(date: Date): string {
  return `${date.getUTCFullYear()}/${pad2(date.getUTCMonth() + 1)}/${pad2(date.getUTCDate())}`;
}

/**
 * The camps, keyed on the school holidays they run in.
 *
 * A « camp » is not a different kind of event: it is a Coding Club that happens
 * to fall in a holiday week, and the campus says so in the campaign name and in
 * the public name. So this is a property of the DATE, derived rather than
 * passed, which is what keeps a Halloween Camp from landing in March.
 *
 * The windows are the French school holidays, narrowed to what production
 * actually used them for. `Back to Epitech` is the rentrée operation and is the
 * one that is not a holiday at all.
 */
const CAMP_WINDOWS: readonly {
  readonly label: string;
  /** `[month, day]`, inclusive, in UTC. Wraps the year end when from > to. */
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
}[] = [
  { label: 'Halloween Camp', from: [10, 20], to: [11, 3] },
  { label: 'Christmas Camp', from: [12, 13], to: [1, 4] },
  { label: 'Winter Camp', from: [2, 12], to: [3, 2] },
  { label: 'Spring Camp', from: [4, 9], to: [4, 27] },
  { label: 'Summer Camp', from: [7, 1], to: [7, 20] },
  { label: 'Back to Epitech', from: [9, 8], to: [9, 22] },
];

/** The camp this date falls in, or null for an ordinary session. */
export function campLabel(date: Date): string | null {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const at = month * 100 + day;
  for (const window of CAMP_WINDOWS) {
    const from = window.from[0] * 100 + window.from[1];
    const to = window.to[0] * 100 + window.to[1];
    const inside = from <= to ? at >= from && at <= to : at >= from || at <= to;
    if (inside) return window.label;
  }
  return null;
}

/**
 * What a campus types after the date when the session is not about a season.
 *
 * Verbatim shapes from production: the game the afternoon was built around, an
 * open day, a lycée the club was run inside, a level it was reserved for. They
 * are here rather than invented per scenario because they are the reason a
 * title list looks alive - fifteen campuses each running « Coding Club » on a
 * different date reads like a fixture, and that is what production is not.
 */
export const CLUB_THEMES = [
  'SnakeJS',
  'PyPong',
  'Dino Hack',
  'P@ssword',
  'CTFD',
  'Aventure Game',
  'Semaine de l’IA',
  'spécial seconde',
  'VIP Terminale',
  'JPO',
] as const;

/** `Coding Club - Lyon - 2026/03/14 - Spring Camp`. */
export function codingClubTitre(opts: {
  campus: string;
  date: Date;
  /** Overrides the camp the date implies. Omit to let the season name it. */
  suffix?: string | null;
}): string {
  const suffix = opts.suffix ?? campLabel(opts.date);
  const base = `Coding Club - ${opts.campus} - ${crmDate(opts.date)}`;
  return suffix ? `${base} - ${suffix}` : base;
}

/** `STAGE - Lyon - 2026/06/15 - stage seconde`. */
export function stageTitre(opts: { campus: string; date: Date }): string {
  return `STAGE - ${opts.campus} - ${crmDate(opts.date)} - stage seconde`;
}

/**
 * The name the campus shows talents: the camp when the date is in one, and the
 * month otherwise. Both shapes are production's own.
 */
export function codingClubPublicName(date: Date): string {
  const camp = campLabel(date);
  if (camp) return camp;
  const month = MONTHS_FR[date.getUTCMonth()]!;
  return `Coding Club - ${month.charAt(0).toUpperCase()}${month.slice(1)} ${date.getUTCFullYear()}`;
}

/** The public name every stage de seconde carries, on all 15 campuses. */
export const STAGE_PUBLIC_NAME = 'Stage de Seconde';
