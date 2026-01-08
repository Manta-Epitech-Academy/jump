import { z } from 'zod';

export const studentSchema = z.object({
	nom: z.string().min(2, 'Le nom doit faire au moins 2 caractères').trim(),
	prenom: z.string().min(2, 'Le prénom doit faire au moins 2 caractères').trim(),
	niveau: z.enum(['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale', 'Sup'], {
		message: 'Veuillez sélectionner un niveau scolaire valide'
	})
	// Avatar est géré à part (input file simple) ou ignoré pour la v1
});

export type StudentForm = z.infer<typeof studentSchema>;
