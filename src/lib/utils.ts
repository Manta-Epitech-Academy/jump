import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getLocalTimeZone, type CalendarDateTime } from '@internationalized/date';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Formats a CalendarDateTime, Date object, or ISO string to a French date string (DD/MM/YYYY)
 */
export function formatDateFr(date: CalendarDateTime | Date | string | undefined): string {
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
		year: 'numeric'
	});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
