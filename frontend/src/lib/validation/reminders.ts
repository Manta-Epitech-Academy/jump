import { z } from 'zod';

export const sendRemindersSchema = z.object({
  talentIds: z
    .union([z.string().min(1), z.array(z.string().min(1))])
    .transform((v) => (Array.isArray(v) ? v : [v])),
  type: z.enum(['student', 'parent']),
});
