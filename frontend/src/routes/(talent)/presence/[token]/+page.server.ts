import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { recomputeEventsCount } from '$lib/server/services/xpService';
import { verifyCheckinToken } from '$lib/server/presence/checkinToken';
import { isSlotClosed } from '$lib/server/presence/slotClosure';
import { eventDisplayName } from '$lib/domain/event';
import {
  dateKeyToDbDate,
  dayLabelFr,
  isPresenceSlot,
  slotLabelFr,
  type CellStatus,
  type PresenceSlot,
} from '$lib/domain/eventPresence';

type CheckinState =
  'present' | 'already' | 'closed' | 'not_registered' | 'invalid';

export const load: PageServerLoad = async ({ params, locals }) => {
  const talent = locals.talent;
  // The (talent) route group guard redirects an unauthenticated scan to login
  // and back here; this is a belt-and-suspenders guard.
  if (!talent) throw error(401, 'Connecte-toi pour t’enregistrer.');

  const empty = {
    eventLabel: '',
    dayLabel: '',
    slotLabel: '',
    slot: 'morning' as PresenceSlot,
    prenom: talent.prenom,
  };

  const payload = await verifyCheckinToken(params.token);
  if (!payload) return { state: 'invalid' as CheckinState, ...empty };

  const { eventId, day, slot } = payload;
  const dayDate = dateKeyToDbDate(day);
  const labels = {
    dayLabel: dayLabelFr(day),
    slotLabel: slotLabelFr(slot),
    slot,
  };

  // Raw client by design: a talent request carries no staff campus to scope by.
  // The signed token (its `eventId`) plus the participation check below are the
  // access gate, in place of the campus scoping the staff routes get.
  const [event, manualCloses, participation] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      select: {
        titre: true,
        publicName: true,
        date: true,
        endDate: true,
        startMinutes: true,
        campus: { select: { timezone: true } },
      },
    }),
    prisma.eventPresenceClosure.findMany({
      where: { eventId, day: dayDate, slot },
      select: { day: true, slot: true },
    }),
    prisma.participation.findUnique({
      where: { talentId_eventId: { talentId: talent.id, eventId } },
      select: { id: true },
    }),
  ]);

  if (!event) return { state: 'invalid' as CheckinState, ...empty };
  const timezone = event.campus?.timezone ?? 'Europe/Paris';
  // The token was signed for a créneau the event has since lost (a QR printed
  // before an afternoon start time was set): nothing to check in to.
  if (!isPresenceSlot(event, timezone, day, slot)) {
    return { state: 'invalid' as CheckinState, ...empty };
  }
  // Short, friendly label: the event's public name when set, else the SF
  // `titre` as a fallback.
  const withLabel = {
    eventLabel: eventDisplayName(event),
    prenom: talent.prenom,
    ...labels,
  };

  // Closed early by a staff member or past the 11h/15h cutoff (campus tz). The
  // cutoff is what makes the QR stop accepting scans on time without any job
  // having to run.
  const closed = isSlotClosed(day, slot, manualCloses, timezone);
  if (closed) return { state: 'closed' as CheckinState, ...withLabel };
  if (!participation)
    return { state: 'not_registered' as CheckinState, ...withLabel };

  // No-downgrade: a status a staff member set by hand wins over a scan, so a
  // self-check-in can rescue a system "absent" but never undo a deliberate call.
  const key = {
    talentId_eventId_day_slot: {
      talentId: talent.id,
      eventId,
      day: dayDate,
      slot,
    },
  };
  const existing = await prisma.eventPresence.findUnique({
    where: key,
    select: { status: true, source: true },
  });
  if (existing && existing.source === 'manual') {
    return {
      state: 'already' as CheckinState,
      status: existing.status as CellStatus,
      ...withLabel,
    };
  }

  // The self-check-in and the `eventsCount` projection commit together: a first
  // scan can make this event count as attended, so refresh the cached count in
  // the same transaction as the write.
  await prisma.$transaction(async (tx) => {
    await tx.eventPresence.upsert({
      where: key,
      create: {
        talentId: talent.id,
        eventId,
        day: dayDate,
        slot,
        status: 'present',
        source: 'qr',
        markedAt: new Date(),
      },
      update: { status: 'present', source: 'qr', markedAt: new Date() },
    });
    await recomputeEventsCount(tx, talent.id);
  });

  return { state: 'present' as CheckinState, ...withLabel };
};
