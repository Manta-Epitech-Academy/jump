import { z } from 'zod';

export const adminLoginSchema = z.object({
  email: z.email('Adresse email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const camperEmailSchema = z.object({
  email: z.email('Adresse email invalide'),
});

export const camperOtpSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .regex(/^\d+$/, 'Le code ne doit contenir que des chiffres')
    .length(6, 'Le code doit contenir 6 chiffres'),
});

export type CamperEmailInput = z.infer<typeof camperEmailSchema>;
export type CamperOtpInput = z.infer<typeof camperOtpSchema>;
