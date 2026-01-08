import { z } from 'zod';

export const sessionSchema = z.object({
	titre: z.string().min(3, 'Le titre doit faire au moins 3 caractères').max(100),
	// On utilise string pour le champ datetime-local, PocketBase le parsra automatiquement
	date: z.string().refine((v) => v !== '', 'La date est requise'),
	statut: z.enum(['planifiee', 'en_cours', 'terminee']).default('planifiee'),
	activity: z.string().min(1, 'Veuillez choisir une activité')
});

export type SessionForm = z.infer<typeof sessionSchema>;
