import { z } from 'zod';

export const activitySchema = z.object({
	nom: z
		.string()
		.min(3, 'Le nom doit faire au moins 3 caractères')
		.max(100, 'Le nom ne peut pas dépasser 100 caractères'),
	description: z.string().min(10, 'La description doit faire au moins 10 caractères'),
	difficulte: z.enum(['Facile', 'Moyen', 'Difficile'], {
		message: 'Veuillez sélectionner une difficulté valide'
	})
});

export type ActivityForm = z.infer<typeof activitySchema>;
