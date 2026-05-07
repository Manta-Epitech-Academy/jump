import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import {
  getTicketWithMessages,
  markTicketSeen,
  postMessage,
  setTicketStatus,
} from '$lib/server/services/tickets';
import { TICKET_STATUSES } from '$lib/domain/tickets';
import { replyMessageSchema } from '$lib/validation/tickets';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (locals.staffProfile?.staffRole !== 'admin') throw error(403);

  const ticket = await getTicketWithMessages(params.id);
  if (!ticket) throw error(404, 'Ticket introuvable');

  await markTicketSeen(ticket.id, 'admin');

  return {
    ticket: {
      id: ticket.id,
      title: ticket.title,
      category: ticket.category,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
      closedAt: ticket.closedAt?.toISOString() ?? null,
      author: ticket.author,
      messages: ticket.messages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        author: m.author,
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
    if (locals.staffProfile?.staffRole !== 'admin' || !locals.user) {
      throw error(403);
    }
    const data = await request.formData();
    const parsed = replyMessageSchema.safeParse({ body: data.get('body') });
    if (!parsed.success) {
      return fail(400, { error: 'Message invalide' });
    }

    await postMessage({
      ticketId: params.id,
      authorId: locals.user.id,
      body: parsed.data.body,
      side: 'admin',
    });
    return { ok: true };
  },

  close: async ({ params, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') throw error(403);
    await setTicketStatus(params.id, TICKET_STATUSES.CLOSED);
    return { ok: true };
  },

  reopen: async ({ params, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') throw error(403);
    await setTicketStatus(params.id, TICKET_STATUSES.OPEN);
    return { ok: true };
  },
};
