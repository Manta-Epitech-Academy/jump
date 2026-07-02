import { prisma } from '$lib/server/db';
import { rolesIn } from '$lib/domain/permissions';
import {
  TICKET_STATUSES,
  type TicketCategory,
  type TicketStatus,
} from '$lib/domain/tickets';

const STAFF_AUTHOR_ROLES = [...rolesIn('devMember')] as const;

export function isStaffAuthor(role: string | null | undefined): boolean {
  return !!role && (STAFF_AUTHOR_ROLES as readonly string[]).includes(role);
}

export async function createTicket(input: {
  authorId: string;
  title: string;
  category: TicketCategory;
  body: string;
}) {
  const now = new Date();
  return prisma.ticket.create({
    data: {
      authorId: input.authorId,
      title: input.title,
      category: input.category,
      lastMessageAt: now,
      lastSeenByAuthorAt: now,
      messages: {
        create: {
          authorId: input.authorId,
          body: input.body,
        },
      },
    },
  });
}

export async function postMessage(input: {
  ticketId: string;
  authorId: string;
  body: string;
  side: 'admin' | 'author';
}) {
  const now = new Date();
  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: {
        ticketId: input.ticketId,
        authorId: input.authorId,
        body: input.body,
      },
    }),
    prisma.ticket.update({
      where: { id: input.ticketId },
      data: {
        lastMessageAt: now,
        ...(input.side === 'admin'
          ? { lastSeenByAdminAt: now }
          : { lastSeenByAuthorAt: now }),
      },
    }),
  ]);
}

export async function setTicketStatus(ticketId: string, status: TicketStatus) {
  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status,
      closedAt: status === TICKET_STATUSES.CLOSED ? new Date() : null,
    },
  });
}

export async function markTicketSeen(
  ticketId: string,
  side: 'admin' | 'author',
) {
  const now = new Date();
  return prisma.ticket.update({
    where: { id: ticketId },
    data:
      side === 'admin'
        ? { lastSeenByAdminAt: now }
        : { lastSeenByAuthorAt: now },
  });
}

export async function listTicketsForAdmin() {
  return prisma.ticket.findMany({
    orderBy: [{ status: 'asc' }, { lastMessageAt: 'desc' }],
    include: {
      author: { select: { id: true, name: true, email: true } },
      _count: { select: { messages: true } },
    },
  });
}

export async function listTicketsForAuthor(authorId: string) {
  return prisma.ticket.findMany({
    where: { authorId },
    orderBy: [{ status: 'asc' }, { lastMessageAt: 'desc' }],
    include: {
      _count: { select: { messages: true } },
    },
  });
}

export async function getTicketWithMessages(ticketId: string) {
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      author: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              staffProfile: { select: { staffRole: true } },
            },
          },
        },
      },
    },
  });
}

export async function countUnreadForAdmin(): Promise<number> {
  const tickets = await prisma.ticket.findMany({
    where: { status: TICKET_STATUSES.OPEN },
    select: { lastMessageAt: true, lastSeenByAdminAt: true },
  });
  return tickets.filter(
    (t) => !t.lastSeenByAdminAt || t.lastMessageAt > t.lastSeenByAdminAt,
  ).length;
}

export async function countUnreadForAuthor(authorId: string): Promise<number> {
  const tickets = await prisma.ticket.findMany({
    where: { authorId },
    select: { lastMessageAt: true, lastSeenByAuthorAt: true },
  });
  return tickets.filter(
    (t) => !t.lastSeenByAuthorAt || t.lastMessageAt > t.lastSeenByAuthorAt,
  ).length;
}

export function serializeTicketRow(t: {
  id: string;
  title: string;
  category: string;
  status: string;
  lastMessageAt: Date;
  lastSeenByAuthorAt: Date | null;
  lastSeenByAdminAt: Date | null;
  createdAt: Date;
  _count: { messages: number };
}) {
  return {
    id: t.id,
    title: t.title,
    category: t.category,
    status: t.status,
    lastMessageAt: t.lastMessageAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
    messageCount: t._count.messages,
    unreadByAuthor:
      !t.lastSeenByAuthorAt || t.lastMessageAt > t.lastSeenByAuthorAt,
    unreadByAdmin:
      !t.lastSeenByAdminAt || t.lastMessageAt > t.lastSeenByAdminAt,
  };
}
