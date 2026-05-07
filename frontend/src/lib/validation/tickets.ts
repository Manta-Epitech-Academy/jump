import { z } from 'zod';
import { TICKET_CATEGORY_VALUES } from '$lib/domain/tickets';

export const createTicketSchema = z.object({
  title: z.string().trim().min(3, '3 caractères minimum').max(120),
  category: z.enum(TICKET_CATEGORY_VALUES as [string, ...string[]]),
  body: z.string().trim().min(10, '10 caractères minimum').max(4000),
});

export const replyMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message requis').max(4000),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type ReplyMessageInput = z.infer<typeof replyMessageSchema>;
