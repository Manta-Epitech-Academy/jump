import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { verifyCheckinToken } from '$lib/server/presence/checkinToken';
import { isSlotPastCutoff } from '$lib/server/presence/slotClosure';
import { eventPublicName } from '$lib/domain/event';
import {
  dateKeyToDbDate,
  dayLabelFr,
  slotLabelFr,
  type CellStatus,
  type PresenceSlot,
} from '$lib/domain/eventPresence';

type CheckinState =
  | 'present'
  | 'already'
  | 'closed'
  | 'not_registered'
  | 'invalid';

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
  const [event, closure, participation] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      select: {
        eventType: true,
        publicName: true,
        campus: { select: { timezone: true } },
      },
    }),
    prisma.eventPresenceClosure.findUnique({
      where: { eventId_day_slot: { eventId, day: dayDate, slot } },
      select: { id: true },
    }),
    prisma.participation.findUnique({
      where: { talentId_eventId: { talentId: talent.id, eventId } },
      select: { id: true },
    }),
  ]);

  if (!event) return { state: 'invalid' as CheckinState, ...empty };
  // Short, friendly label: the event's public name when set, else the type
  // label ("Stage de Seconde") - never the cohort `titre`.
  const withLabel = {
    eventLabel: eventPublicName(event),
    prenom: talent.prenom,
    ...labels,
  };

  // Closed = a manual early-close OR the 11h/15h cutoff has passed (campus tz).
  // The cutoff check is what makes the QR stop accepting scans on time without
  // any job having to run.
  const closed =
    !!closure ||
    isSlotPastCutoff(day, slot, event.campus?.timezone ?? 'Europe/Paris');
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

  await prisma.eventPresence.upsert({
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

  return { state: 'present' as CheckinState, ...withLabel };
};
