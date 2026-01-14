import { z } from 'zod';

export const studentSchema = z.object({
	nom: z.string().min(2, 'Le nom doit faire au moins 2 caractères').trim(),
	prenom: z.string().min(2, 'Le prénom doit faire au moins 2 caractères').trim(),
	email: z.email('Email invalide').optional().or(z.literal('')),
	phone: z.string().optional(),
	niveau: z.enum(['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale', 'Sup'], {
		message: 'Veuillez sélectionner un niveau scolaire valide'
	})
});

export type StudentForm = z.infer<typeof studentSchema>;
