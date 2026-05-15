export const TICKET_CATEGORIES = {
  BUG: 'bug',
  SUGGESTION: 'suggestion',
} as const;

export type TicketCategory =
  (typeof TICKET_CATEGORIES)[keyof typeof TICKET_CATEGORIES];

export const TICKET_CATEGORY_VALUES = Object.values(
  TICKET_CATEGORIES,
) as TicketCategory[];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug: 'Bug',
  suggestion: 'Suggestion',
};

export const TICKET_STATUSES = {
  OPEN: 'open',
  CLOSED: 'closed',
} as const;

export type TicketStatus =
  (typeof TICKET_STATUSES)[keyof typeof TICKET_STATUSES];
