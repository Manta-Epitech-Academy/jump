import { z } from 'zod';
import {
  MASCOT_GLASSES,
  MASCOT_HAIRS,
  MASCOT_NAME_MAX,
  MASCOT_SCARVES,
  type MascotChoice,
  type MascotGlasses,
  type MascotHair,
  type MascotScarf,
} from '#lib/domain/mascot.ts';

const keys = <K extends string>(record: Record<K, string>) =>
  Object.keys(record) as [K, ...K[]];

/**
 * The talent's choice for their EpiDuck (#539), as « Mon EpiDuck » saves it
 * whole on every change (#552): a name and three accessories. An empty name
 * gives him back his own (`MASCOT_DEFAULT_NAME`).
 */
export const mascotChoiceSchema = z.object({
  name: z
    .string()
    .trim()
    .max(MASCOT_NAME_MAX, `${MASCOT_NAME_MAX} caractères maximum.`),
  glasses: z.enum(keys<MascotGlasses>(MASCOT_GLASSES)),
  scarf: z.enum(keys<MascotScarf>(MASCOT_SCARVES)),
  hair: z.enum(keys<MascotHair>(MASCOT_HAIRS)),
}) satisfies z.ZodType<MascotChoice>;
