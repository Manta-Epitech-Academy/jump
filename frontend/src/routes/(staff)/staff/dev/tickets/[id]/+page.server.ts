import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import {
  getTicketWithMessages,
  markTicketSeen,
  postMessage,
} from '$lib/server/services/tickets';
import { replyMessageSchema } from '$lib/validation/tickets';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.ticketsEnabled) throw error(404);
  if (!locals.user) throw error(403);

  const ticket = await getTicketWithMessages(params.id);
  if (!ticket) throw error(404, 'Ticket introuvable');
  if (ticket.authorId !== locals.user.id) throw error(403);

  await markTicketSeen(ticket.id, 'author');

  return {
    ticket: {
      id: ticket.id,
      title: ticket.title,
      category: ticket.category,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
      messages: ticket.messages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        author: {
          name: m.author.name,
          email: m.author.email,
        },
        side:
          m.author.staffProfile?.staffRole === 'admin'
            ? ('admin' as const)
            : ('author' as const),
      })),
    },
  };
};

export const actions: Actions = {
  reply: async ({ request, params, locals }) => {
    if (!locals.ticketsEnabled || !locals.user) throw error(403);

    const ticket = await getTicketWithMessages(params.id);
    if (!ticket) throw error(404);
    if (ticket.authorId !== locals.user.id) throw error(403);
    if (ticket.status !== 'open') return fail(400, { error: 'Ticket fermé' });

    const data = await request.formData();
    const parsed = replyMessageSchema.safeParse({ body: data.get('body') });
    if (!parsed.success) return fail(400, { error: 'Message invalide' });

    await postMessage({
      ticketId: params.id,
      authorId: locals.user.id,
      body: parsed.data.body,
      side: 'author',
    });
    return { ok: true };
  },
};
