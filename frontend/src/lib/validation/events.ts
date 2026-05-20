import { z } from 'zod';

export const eventSchema = z.object({
  theme: z.string().default(''),
  notes: z.string().optional().or(z.literal('')),
});

export type EventForm = z.infer<typeof eventSchema>;
