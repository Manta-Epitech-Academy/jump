import { z } from 'zod';

const noteBody = z
  .string()
  .trim()
  .min(1, 'La note est vide')
  .max(5000, 'Maximum 5000 caractères');

/**
 * Create a new note on a talent. `eventId` anchors the event; `presenceDay` +
 * `presenceSlot` further pin the émargement créneau it was taken on (the dialog
 * sends them so the roster trigger and "Ce créneau" group are exact, not inferred
 * from the clock). The two créneau fields travel together and only make sense
 * with an event, so they're refused without one.
 */
export const noteCreateSchema = z
  .object({
    body: noteBody,
    eventId: z.string().optional(),
    presenceDay: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Jour de créneau invalide')
      .optional(),
    presenceSlot: z.enum(['morning', 'afternoon']).optional(),
  })
  .refine((v) => (v.presenceDay == null) === (v.presenceSlot == null), {
    message: 'Le créneau doit être complet (jour + demi-journée).',
    path: ['presenceSlot'],
  })
  .refine((v) => v.presenceSlot == null || v.eventId != null, {
    message: 'Un créneau ne peut être ancré sans événement.',
    path: ['presenceSlot'],
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
