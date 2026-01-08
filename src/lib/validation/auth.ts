import { z } from 'zod';

export const registerSchema = z
	.object({
		username: z.string().min(3).max(50),
		email: z.string().email(),
		password: z.string().min(8),
		passwordConfirm: z.string().min(8)
	})
	.refine((data) => data.password === data.passwordConfirm, {
		path: ['passwordConfirm'],
		message: 'Les mots de passe ne correspondent pas'
	});

export const loginSchema = z.object({
	identity: z.string().min(1, 'Email ou username requis'),
	password: z.string().min(1, 'Mot de passe requis')
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
