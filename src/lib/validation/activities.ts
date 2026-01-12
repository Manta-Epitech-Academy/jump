import { z } from 'zod';

export const schoolLevels = [
	'6eme',
	'5eme',
	'4eme',
	'3eme',
	'2nde',
	'1ere',
	'Terminale',
	'Sup'
] as const;

export const activitySchema = z.object({
	nom: z
		.string()
		.min(3, 'Le nom doit faire au moins 3 caractères')
		.max(100, 'Le nom ne peut pas dépasser 100 caractères'),
	description: z.string().min(10, 'La description doit faire au moins 10 caractères'),
	niveaux: z
		.array(z.enum(schoolLevels))
		.min(1, 'Veuillez sélectionner au moins un niveau scolaire'),
	themes: z.array(z.string()).default([])
});

export type ActivityForm = z.infer<typeof activitySchema>;
