import { z } from 'zod';
import {
  MASCOT_GLASSES,
  MASCOT_HAIRS,
  MASCOT_NAME_MAX,
  MASCOT_SCARVES,
  type MascotGlasses,
  type MascotHair,
  type MascotScarf,
} from '#lib/domain/mascot.ts';

const keys = <K extends string>(record: Record<K, string>) =>
  Object.keys(record) as [K, ...K[]];

/**
 * The talent's « Mon EpiDuck » card (#539): a name and three accessories. An
 * empty name gives him back his own (`MASCOT_DEFAULT_NAME`), so clearing the
 * field is how a talent undoes a rename.
 */
export const mascotLookSchema = z.object({
  name: z
    .string()
    .trim()
    .max(MASCOT_NAME_MAX, `${MASCOT_NAME_MAX} caractères maximum.`)
    .default(''),
  glasses: z.enum(keys<MascotGlasses>(MASCOT_GLASSES)).default('none'),
  scarf: z.enum(keys<MascotScarf>(MASCOT_SCARVES)).default('none'),
  hair: z.enum(keys<MascotHair>(MASCOT_HAIRS)).default('tuft'),
});

export type MascotLookForm = z.infer<typeof mascotLookSchema>;
