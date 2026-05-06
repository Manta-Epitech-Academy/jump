import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { createTicketSchema } from '$lib/validation/tickets';
import { createTicket, isStaffAuthor } from '$lib/server/services/tickets';
import type { TicketCategory } from '$lib/domain/tickets';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.ticketsEnabled) throw error(403, 'Tickets désactivés');
  if (!locals.user || !isStaffAuthor(locals.staffProfile?.staffRole)) {
    throw error(403);
  }

  const payload = await request.json();
  const parsed = createTicketSchema.safeParse(payload);
  if (!parsed.success) {
    throw error(400, parsed.error.issues[0]?.message ?? 'Données invalides');
  }

  const ticket = await createTicket({
    authorId: locals.user.id,
    title: parsed.data.title,
    category: parsed.data.category as TicketCategory,
    body: parsed.data.body,
  });

  return json({ id: ticket.id });
};
