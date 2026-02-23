import { z } from 'zod';

export const registerSchema = z
	.object({
		username: z
			.string()
			.min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères")
			.max(50, "Le nom d'utilisateur ne peut pas dépasser 50 caractères"),
		email: z.email('Adresse email invalide'),
		password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
		passwordConfirm: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères')
	})
	.refine((data) => data.password === data.passwordConfirm, {
		path: ['passwordConfirm'],
		message: 'Les mots de passe ne correspondent pas'
	});

export const loginSchema = z.object({
	identity: z.string().min(1, 'Email ou username requis'),
	password: z.string().min(1, 'Mot de passe requis')
});

export const adminLoginSchema = z.object({
	email: z.email('Adresse email invalide'),
	password: z.string().min(1, 'Mot de passe requis')
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
