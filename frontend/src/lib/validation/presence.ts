import { z } from 'zod';

// Calendar day in the campus timezone, ISO 8601 `YYYY-MM-DD`. The server
// resolves these against the event's créneau list, so a wall-clock day is
// unambiguous regardless of the staff member's browser timezone.
const dateKeyRegex = /^\d{4}-\d{2}-\d{2}$/;
const dayKey = z
  .string()
  .regex(dateKeyRegex, 'Format de date invalide (YYYY-MM-DD)');

export const presenceSlots = ['morning', 'afternoon'] as const;
// Four exclusive states; `pending` is a settable target meaning "clear this
// cell" (delete the row), the other four are stored statuses.
export const presenceStatuses = [
  'present',
  'late',
  'absent',
  'excused',
  'pending',
] as const;

const slot = z.enum(presenceSlots);

export const setPresenceSchema = z.object({
  talentId: z.string().min(1),
  day: dayKey,
  slot,
  // Four exclusive states, no free-text motif and no late minutes:
  // "en retard" is just a flag, per product.
  status: z.enum(presenceStatuses),
});

// Bulk "everyone present": targets a whole créneau, like closeSlot. Fills the
// still-pending cells present; cells already marked are left as-is server-side.
export const markAllPresentSchema = z.object({
  day: dayKey,
  slot,
});

export const closeSlotSchema = z.object({
  day: dayKey,
  slot,
});

export const reopenSlotSchema = z.object({
  day: dayKey,
  slot,
});

export type SetPresenceInput = z.infer<typeof setPresenceSchema>;
