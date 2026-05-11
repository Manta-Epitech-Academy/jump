import { z } from 'zod';

export const RELANCE_SUBJECT_MAX = 200;
export const RELANCE_BODY_MAX = 5000;

export const sendRelanceSchema = z.object({
  talentIds: z
    .union([z.string().min(1), z.array(z.string().min(1))])
    .transform((v) => (Array.isArray(v) ? v : [v])),
  type: z.enum(['student', 'parent']),
  subject: z.string().min(1).max(RELANCE_SUBJECT_MAX),
  body: z.string().min(1).max(RELANCE_BODY_MAX),
});

export type SendRelanceInput = z.infer<typeof sendRelanceSchema>;
