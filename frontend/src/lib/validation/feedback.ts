import { z } from 'zod';

export const feedbackSubmitSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});
