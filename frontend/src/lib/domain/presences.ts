import type { ScopedPrismaClient } from '$lib/server/db/scoped';

export type SlotStatus = 'past' | 'live' | 'upcoming';

export type OrgaSlot = {
  activityId: string;
  timeSlotId: string;
  nom: string;
  startTime: Date;
  endTime: Date;
  status: SlotStatus;
};

export type OrgaSlotWithCounts = OrgaSlot & {
  presentCount: number;
  lateCount: number;
  totalCount: number;
};

export type SlotDayGroup<T extends OrgaSlot = OrgaSlot> = {
  dateKey: string;
  dayLabel: string;
  slots: T[];
};

export function computeSlotStatus(
  startTime: Date,
  endTime: Date,
  now: Date,
): SlotStatus {
  if (now.getTime() < startTime.getTime()) return 'upcoming';
  if (now.getTime() > endTime.getTime()) return 'past';
  return 'live';
}

export async function getEventOrgaSlots(
  eventId: string,
  db: ScopedPrismaClient,
  now: Date = new Date(),
): Promise<OrgaSlot[]> {
  const planning = await db.planning.findFirst({
    where: { eventId },
    include: {
      timeSlots: {
        where: { activity: { activityType: 'orga' } },
        orderBy: { startTime: 'asc' },
        include: { activity: true },
      },
    },
  });

  if (!planning) return [];

  return planning.timeSlots.flatMap((ts) =>
    ts.activity
      ? [
          {
            activityId: ts.activity.id,
            timeSlotId: ts.id,
            nom: ts.activity.nom,
            startTime: ts.startTime,
            endTime: ts.endTime,
            status: computeSlotStatus(ts.startTime, ts.endTime, now),
          },
        ]
      : [],
  );
}

export async function getEventOrgaSlotsWithCounts(
  eventId: string,
  db: ScopedPrismaClient,
  now: Date = new Date(),
): Promise<OrgaSlotWithCounts[]> {
  const slots = await getEventOrgaSlots(eventId, db, now);
  if (slots.length === 0) return [];

  const activityIds = slots.map((s) => s.activityId);

  const [totalCount, grouped, lateGrouped] = await Promise.all([
    db.participation.count({
      where: { eventId },
    }),
    db.participationActivity.groupBy({
      by: ['activityId', 'isPresent'],
      where: {
        activityId: { in: activityIds },
        participation: { eventId },
      },
      _count: { _all: true },
    }),
    db.participationActivity.groupBy({
      by: ['activityId'],
      where: {
        activityId: { in: activityIds },
        participation: { eventId },
        isPresent: true,
        delay: { gt: 0 },
      },
      _count: { _all: true },
    }),
  ]);

  const presentByActivity = new Map<string, number>();
  for (const row of grouped) {
    if (row.isPresent) {
      presentByActivity.set(row.activityId, row._count._all);
    }
  }

  const lateByActivity = new Map<string, number>();
  for (const row of lateGrouped) {
    lateByActivity.set(row.activityId, row._count._all);
  }

  return slots.map((s) => ({
    ...s,
    presentCount: presentByActivity.get(s.activityId) ?? 0,
    lateCount: lateByActivity.get(s.activityId) ?? 0,
    totalCount,
  }));
}

/**
 * Picks the slot that should be the primary CTA on the hub:
 * live now > next upcoming > most recent past.
 */
export function findPrimarySlot(
  slots: OrgaSlot[],
  now: Date = new Date(),
): OrgaSlot | null {
  if (slots.length === 0) return null;
  const live = slots.find((s) => s.status === 'live');
  if (live) return live;
  const upcoming = slots.find((s) => s.status === 'upcoming');
  if (upcoming) return upcoming;
  const pastSlots = slots.filter((s) => s.status === 'past');
  return pastSlots.length > 0 ? pastSlots[pastSlots.length - 1] : null;
}

export function getAdjacentSlots<T extends OrgaSlot>(
  slots: T[],
  currentActivityId: string,
): { prev: T | null; next: T | null; current: T | null } {
  const idx = slots.findIndex((s) => s.activityId === currentActivityId);
  if (idx === -1) return { prev: null, next: null, current: null };
  return {
    prev: idx > 0 ? slots[idx - 1] : null,
    next: idx < slots.length - 1 ? slots[idx + 1] : null,
    current: slots[idx],
  };
}

const SLOT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
};

const SLOT_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
};

const DAY_HEADING_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
};

const DATE_KEY_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

function stripTrailingDot(s: string): string {
  return s.replace(/\.$/, '');
}

/**
 * Renders "Lun 28 avr · 09:00 — 09:30" — distinguishes same-time slots
 * across multiple days.
 */
export function formatSlotLabel(
  startTime: Date,
  endTime: Date,
  timezone: string,
): string {
  const datePart = stripTrailingDot(
    new Intl.DateTimeFormat('fr-FR', {
      ...SLOT_DATE_FORMAT,
      timeZone: timezone,
    }).format(startTime),
  );
  const startTimePart = new Intl.DateTimeFormat('fr-FR', {
    ...SLOT_TIME_FORMAT,
    timeZone: timezone,
  }).format(startTime);
  const endTimePart = new Intl.DateTimeFormat('fr-FR', {
    ...SLOT_TIME_FORMAT,
    timeZone: timezone,
  }).format(endTime);
  return `${datePart} · ${startTimePart} — ${endTimePart}`;
}

export function formatSlotTimeRange(
  startTime: Date,
  endTime: Date,
  timezone: string,
): string {
  const startTimePart = new Intl.DateTimeFormat('fr-FR', {
    ...SLOT_TIME_FORMAT,
    timeZone: timezone,
  }).format(startTime);
  const endTimePart = new Intl.DateTimeFormat('fr-FR', {
    ...SLOT_TIME_FORMAT,
    timeZone: timezone,
  }).format(endTime);
  return `${startTimePart} — ${endTimePart}`;
}

export function formatDayHeading(date: Date, timezone: string): string {
  const heading = new Intl.DateTimeFormat('fr-FR', {
    ...DAY_HEADING_FORMAT,
    timeZone: timezone,
  }).format(date);
  return heading.charAt(0).toUpperCase() + heading.slice(1);
}

function dateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    ...DATE_KEY_FORMAT,
    timeZone: timezone,
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function groupSlotsByDay<T extends OrgaSlot>(
  slots: T[],
  timezone: string,
): SlotDayGroup<T>[] {
  const map = new Map<string, SlotDayGroup<T>>();
  for (const slot of slots) {
    const key = dateKey(slot.startTime, timezone);
    let group = map.get(key);
    if (!group) {
      group = {
        dateKey: key,
        dayLabel: formatDayHeading(slot.startTime, timezone),
        slots: [],
      };
      map.set(key, group);
    }
    group.slots.push(slot);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.dateKey.localeCompare(b.dateKey),
  );
}
