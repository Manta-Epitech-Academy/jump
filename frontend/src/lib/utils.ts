import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  getLocalTimeZone,
  now,
  type CalendarDateTime,
} from '@internationalized/date';
import type {
  EventsResponse,
  SubjectsResponse,
  ParticipationsResponse,
} from '$lib/pocketbase-types';

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

export type ParticipationExpand = {
  event: EventsResponse;
  subjects: SubjectsResponse[];
};

export type Mission = {
  subject: { id: string; nom: string };
  eventDate: string;
  eventTitle: string;
};

export function flattenMissions(
  participations: ParticipationsResponse<ParticipationExpand>[],
): Mission[] {
  const missions: Mission[] = [];
  for (const p of participations) {
    if (p.expand?.subjects) {
      for (const sub of p.expand.subjects) {
        missions.push({
          subject: sub,
          eventDate: p.expand.event?.date || '',
          eventTitle: p.expand.event?.titre || 'Atelier',
        });
      }
    }
  }
  return missions;
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
