import { z } from 'zod';

export const sendRemindersSchema = z.object({
  talentIds: z
    .array(z.string().min(1))
    .min(1, 'Sélectionnez au moins un talent'),
  type: z.enum(['student', 'parent']),
});
