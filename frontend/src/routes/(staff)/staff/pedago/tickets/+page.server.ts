import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
  listTicketsForAuthor,
  serializeTicketRow,
} from '$lib/server/services/tickets';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.ticketsEnabled) throw error(404);
  if (!locals.user) throw error(403);

  const tickets = await listTicketsForAuthor(locals.user.id);
  return {
    tickets: tickets.map((t) => {
      const row = serializeTicketRow(t);
      return { ...row, unread: row.unreadByAuthor };
    }),
  };
};
