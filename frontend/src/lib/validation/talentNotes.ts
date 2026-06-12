import { z } from 'zod';

// Staff-only free-text note on a Talent. `baseContent` carries the note as the
// editor loaded it, used for optimistic concurrency (compare-and-set) so a
// concurrent edit can't be silently overwritten.
export const talentNoteSchema = z.object({
  content: z.string().trim().max(5000, 'Maximum 5000 caractères'),
  baseContent: z.string().max(5000).default(''),
});

export type TalentNoteForm = z.infer<typeof talentNoteSchema>;
