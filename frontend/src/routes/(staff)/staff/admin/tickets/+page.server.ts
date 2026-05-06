import type { PageServerLoad } from './$types';
import { listTicketsForAdmin } from '$lib/server/services/tickets';

export const load: PageServerLoad = async ({ locals }) => {
  const tickets = await listTicketsForAdmin();
  return {
    ticketsEnabled: locals.ticketsEnabled,
    tickets: tickets.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      status: t.status,
      lastMessageAt: t.lastMessageAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
      messageCount: t._count.messages,
      author: t.author,
      unread: !t.lastSeenByAdminAt || t.lastMessageAt > t.lastSeenByAdminAt,
    })),
  };
};
