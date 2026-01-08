import { z } from 'zod';

export const activitySchema = z.object({
	nom: z.string().min(3, 'Le nom doit faire au moins 3 caractères').max(100),
	description: z.string().min(10, 'La description doit faire au moins 10 caractères'),
	difficulte: z.enum(['Facile', 'Moyen', 'Difficile'], {
		message: 'Veuillez sélectionner une difficulté valide'
	})
});

export type ActivityForm = z.infer<typeof activitySchema>;
