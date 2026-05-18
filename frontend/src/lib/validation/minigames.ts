import { z } from 'zod';

export const SCORING_TYPES = ['score', 'chrono'] as const;

export const gameConfigSchema = z.object({
  game: z
    .string()
    .min(1, 'Identifiant requis')
    .max(50)
    .regex(
      /^[a-z0-9_-]+$/,
      'Lettres minuscules, chiffres, tiret et underscore uniquement',
    ),
  levelCount: z.coerce.number().int().min(0, 'Doit être ≥ 0'),
  weight: z.coerce.number().int().min(1, 'Doit être ≥ 1'),
  scoringType: z.enum(SCORING_TYPES),
  enabled: z.boolean().default(true),
});

export const gameConfigUpdateSchema = gameConfigSchema.extend({
  game: z.string().min(1),
});

export const forcePublicationSchema = z.object({
  game: z.string().min(1, 'Jeu requis'),
  level: z.coerce.number().int().min(1, 'Niveau ≥ 1'),
});

export type GameConfigForm = z.infer<typeof gameConfigSchema>;
export type ForcePublicationForm = z.infer<typeof forcePublicationSchema>;
