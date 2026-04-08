import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  getLocalTimeZone,
  now,
  type CalendarDateTime,
} from '@internationalized/date';
import type {
  ParticipationWithEvent,
  ParticipationWithThemes,
} from '$lib/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a CalendarDateTime, Date object, or ISO string to a French date string (DD/MM/YYYY)
 */
export function formatDateFr(
  date: CalendarDateTime | Date | string | undefined,
): string {
  if (!date) return 'Sélectionner une date';

  let jsDate: Date;

  if (typeof date === 'string') {
    jsDate = new Date(date);
  } else if (date instanceof Date) {
    jsDate = date;
  } else {
    // Assumes CalendarDateTime if it's not a string or Date
    jsDate = date.toDate(getLocalTimeZone());
  }

  return jsDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export type Mission = {
  subject: { id: string; nom: string };
  eventDate: string;
  eventTitle: string;
};

export function flattenMissions(
  participations: ParticipationWithEvent[],
): Mission[] {
  const missions: Mission[] = [];
  for (const p of participations) {
    for (const ps of p.subjects) {
      missions.push({
        subject: ps.subject,
        eventDate: String(p.event?.date || ''),
        eventTitle: p.event?.titre || 'Atelier',
      });
    }
  }
  return missions;
}

const THEME_TIERS = [
  { min: 4, label: 'Expert' },
  { min: 2, label: 'Confirmé' },
  { min: 0, label: 'Initié' },
] as const;

/** The count at which the progress bar reaches 100% — derived from the highest tier threshold. */
export const THEME_TIER_CEILING = THEME_TIERS[0].min;

export function themeTierLabel(count: number): string {
  return (THEME_TIERS.find((t) => count >= t.min) ?? THEME_TIERS.at(-1)!).label;
}

/**
 * Tallies up theme occurrences from completed participations and returns the top N.
 * Subjects without themes are counted under "Général".
 */
export function tallyTopThemes(
  participations: ParticipationWithThemes[],
  limit: number,
): { name: string; count: number; label: string }[] {
  const tally: Record<string, number> = {};
  for (const p of participations) {
    for (const ps of p.subjects) {
      const themes = ps.subject.subjectThemes?.map((st) => st.theme) ?? [];
      if (themes.length === 0) {
        tally['Général'] = (tally['Général'] || 0) + 1;
      } else {
        for (const t of themes) {
          tally[t.nom] = (tally[t.nom] || 0) + 1;
        }
      }
    }
  }
  return Object.entries(tally)
    .map(([name, count]) => ({ name, count, label: themeTierLabel(count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function getParisStartOfDay(): string {
  const parisNow = now('Europe/Paris');
  const startOfDay = parisNow.set({
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  return startOfDay.toDate().toISOString().replace('T', ' ');
}

export function generatePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any }
  ? Omit<T, 'children'>
  : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
  ref?: U | null;
};
