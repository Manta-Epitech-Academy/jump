import { CalendarDate } from '@internationalized/date';
import type { DateKey } from './planningTime';

// ─── Jours fériés ──────────────────────────────────────────────────────────
//
// French public holidays, computed rather than stored: the law fixes eleven
// dates, three of them hang off Easter, and Easter is arithmetic. So no data
// file to refresh and no year it stops knowing.
//
// The département decides which law applies, and two places add to the
// national list: Alsace-Moselle keeps Good Friday and St Stephen's Day from the
// local law it kept in 1918, and each overseas département marks the abolition
// of slavery on its own date. The collectivities of the Pacific (986-988) have
// calendars of their own this module does not hold, so they get none rather
// than the metropolitan list, which would be wrong there.
//
// Names are the ones the 2027 mockup prints in the campus calendar.

/** The day of the year Easter Sunday falls on (Gregorian computus). */
function easterSunday(year: number): CalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new CalendarDate(year, month, day);
}

/** Alsace-Moselle: the Bas-Rhin, the Haut-Rhin and the Moselle. */
const ALSACE_MOSELLE = new Set(['57', '67', '68']);

/** Abolition of slavery, per overseas département (month, day). */
const ABOLITION_BY_DEPARTEMENT: Record<string, [number, number]> = {
  '971': [5, 27],
  '972': [5, 22],
  '973': [6, 10],
  '974': [12, 20],
  '976': [4, 27],
};

/** Codes this module has no law for: the Pacific collectivities. */
const UNKNOWN_REGIME = new Set(['986', '987', '988']);

export type PublicHoliday = { day: DateKey; name: string };

/**
 * The public holidays of `year` in `departement`, in date order, or null when
 * the département is one whose holidays this module does not know.
 */
export function publicHolidays(
  departement: string,
  year: number,
): PublicHoliday[] | null {
  if (UNKNOWN_REGIME.has(departement)) return null;
  const easter = easterSunday(year);
  const on = (month: number, day: number) => new CalendarDate(year, month, day);
  const days: [CalendarDate, string][] = [
    [on(1, 1), "Jour de l'an"],
    [easter.add({ days: 1 }), 'Lundi de Pâques'],
    [on(5, 1), 'Fête du Travail'],
    [on(5, 8), 'Victoire 1945'],
    [easter.add({ days: 39 }), 'Ascension'],
    [easter.add({ days: 50 }), 'Lundi de Pentecôte'],
    [on(7, 14), 'Fête nationale'],
    [on(8, 15), 'Assomption'],
    [on(11, 1), 'Toussaint'],
    [on(11, 11), 'Armistice'],
    [on(12, 25), 'Noël'],
  ];
  if (ALSACE_MOSELLE.has(departement)) {
    days.push([easter.subtract({ days: 2 }), 'Vendredi saint']);
    days.push([on(12, 26), 'Saint-Étienne']);
  }
  const abolition = ABOLITION_BY_DEPARTEMENT[departement];
  if (abolition) days.push([on(...abolition), "Abolition de l'esclavage"]);
  return days
    .sort(([a], [b]) => a.compare(b))
    .map(([date, name]) => ({ day: date.toString(), name }));
}
