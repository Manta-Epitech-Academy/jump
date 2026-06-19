import { z } from 'zod';

const noteBody = z
  .string()
  .trim()
  .min(1, 'La note est vide')
  .max(5000, 'Maximum 5000 caractères');

/** Create a new note on a talent. `eventId` anchors the émargement context. */
export const noteCreateSchema = z.object({
  body: noteBody,
  eventId: z.string().optional(),
});

/**
 * Edit an existing note. `baseUpdatedAt` is the `updatedAt` the editor loaded
 * (ISO), used for the per-note optimistic compare-and-set.
 */
export const noteUpdateSchema = z.object({
  body: noteBody,
  baseUpdatedAt: z.string().min(1),
});

export type NoteCreateInput = z.infer<typeof noteCreateSchema>;
export type NoteUpdateInput = z.infer<typeof noteUpdateSchema>;
