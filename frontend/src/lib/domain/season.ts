import type { DateKey } from './planningTime';

/**
 * The seasons the dev space's talent fiche marks with a pixel motif in place of
 * its pixel squares: only those the Epitech charte can draw. Halloween is an
 * orange jack-o'-lantern with a green stem, December a white snowflake on the
 * brand blue. Summer, spring or a Christmas red have no colour in the charte, so
 * they get nothing rather than an off-palette motif.
 */
export type Season = 'halloween' | 'winter';

/** The season of a campus day, if it has one. */
export function seasonOn(day: DateKey): Season | null {
  const monthDay = day.slice(5);
  if (monthDay >= '10-15' && monthDay <= '10-31') return 'halloween';
  if (monthDay.startsWith('12-')) return 'winter';
  return null;
}
