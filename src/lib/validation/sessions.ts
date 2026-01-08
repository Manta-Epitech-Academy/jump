import { z } from 'zod';
import { CalendarDateTime } from '@internationalized/date';

export const sessionSchema = z.object({
	titre: z.string().min(3, 'Le titre doit faire au moins 3 caractères').max(100),
	date: z.custom<CalendarDateTime>((val) => val instanceof CalendarDateTime, {
		message: 'La date est requise'
	}),
	time: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Format horaire invalide (HH:MM)'),
	statut: z.enum(['planifiee', 'en_cours', 'terminee']).default('planifiee'),
	activity: z.string().min(1, 'Veuillez choisir une activité')
});

export type SessionForm = z.infer<typeof sessionSchema>;
