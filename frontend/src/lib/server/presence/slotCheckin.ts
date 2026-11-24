import { error } from '@sveltejs/kit';
import { loadEventOr404 } from '#lib/server/services/stageContext.ts';
import { EVENT_MODULES } from '#lib/domain/eventModules.ts';
import {
  PRESENCE_SLOTS,
  presenceSlotOf,
  dateKeyToDbDate,
  type PresenceSlot,
} from '#lib/domain/eventPresence.ts';
import { eventDisplayName } from '#lib/domain/event.ts';
import { mintCheckinToken, buildCheckinLink } from './checkinToken';

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseSlot(raw: string | null): PresenceSlot {
  if (raw && (PRESENCE_SLOTS as readonly string[]).includes(raw)) {
    return raw as PresenceSlot;
  }
  throw error(400, 'Créneau invalide.');
}

/**
 * Validate a (day, slot) against an event and mint the QR check-in link for it.
 * Shared by the live QR endpoint and the printable-PDF endpoint so both encode
 * exactly the same signed slot. The token's `exp` is a stale-link backstop a
 * couple of days past the target day (the real gate is `isSlotClosed`, applied
 * when the code is scanned).
 */
export async function resolveSlotCheckinLink(opts: {
  eventId: string;
  campusId: string;
  timezone: string;
  day: string | null;
  slot: string | null;
}): Promise<{
  link: string;
  expiresAt: Date;
  day: string;
  slot: PresenceSlot;
  eventLabel: string;
}> {
  const slot = parseSlot(opts.slot);
  if (!opts.day || !DAY_KEY_RE.test(opts.day)) {
    throw error(400, 'Jour invalide.');
  }
  const event = await loadEventOr404(
    opts.eventId,
    opts.campusId,
    EVENT_MODULES.EMARGEMENT,
  );
  const at = presenceSlotOf(event, opts.timezone, opts.day, slot);
  if (!at) throw error(400, "Ce créneau n'appartient pas à l'événement.");

  const expiresAt = new Date(
    dateKeyToDbDate(at.day).getTime() + 2 * 86_400_000,
  );
  const token = await mintCheckinToken(
    { eventId: at.eventId, day: at.day, slot: at.slot },
    expiresAt,
  );

  return {
    link: buildCheckinLink(token),
    expiresAt,
    day: opts.day,
    slot,
    eventLabel: eventDisplayName(event),
  };
}
