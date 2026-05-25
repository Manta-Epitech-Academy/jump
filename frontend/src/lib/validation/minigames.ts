import { z } from 'zod';

// A game's slug, level count and scoring mode are owned by the jump-games
// catalogue, never entered by hand. The admin form only curates rotation, so
// it carries the chosen slug plus the two host-side decisions: weight + on/off.
// `game` is validated against the live catalogue in the action, not here.
export const gameConfigSchema = z.object({
  game: z
    .string()
    .min(1, 'Jeu requis')
    .max(50)
    .regex(/^[a-z0-9_-]+$/, 'Slug invalide'),
  weight: z.coerce.number().int().min(1, 'Doit être ≥ 1'),
  enabled: z.boolean().default(true),
});

export const forcePublicationSchema = z.object({
  game: z.string().min(1, 'Jeu requis'),
  level: z.coerce.number().int().min(1, 'Niveau ≥ 1'),
});

export type GameConfigForm = z.infer<typeof gameConfigSchema>;
export type ForcePublicationForm = z.infer<typeof forcePublicationSchema>;
