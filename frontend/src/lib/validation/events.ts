import { z } from 'zod';
import { CalendarDateTime } from '@internationalized/date';

export const eventSchema = z.object({
	titre: z
		.string()
		.min(3, 'Le titre doit faire au moins 3 caractères')
		.max(100, 'Le titre ne peut pas dépasser 100 caractères'),
	date: z.union(
		[z.custom<CalendarDateTime>((val) => val instanceof CalendarDateTime), z.string()],
		{
			message: 'La date est requise'
		}
	),
	time: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Format horaire invalide (HH:MM)'),
	theme: z.string().default(''),
	notes: z.string().optional().or(z.literal('')),
	subject: z.string().optional(),
	mantas: z.array(z.string()).default([])
});

export const addParticipantSchema = z.object({
	studentId: z.string().min(1, 'Veuillez sélectionner un élève')
});

export type EventForm = z.infer<typeof eventSchema>;
export type AddParticipantForm = z.infer<typeof addParticipantSchema>;
