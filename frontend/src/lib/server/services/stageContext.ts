import { error } from '@sveltejs/kit';
import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import { EVENT_TYPES } from '$lib/domain/event';
import type { EventLifecycleStatus } from '$lib/domain/eventLifecycle';
import { prisma } from '$lib/server/db';

export const STAGE_DEFAULT_DURATION_DAYS = 14;
export const STAGE_UPCOMING_WINDOW_DAYS = 60;

const MS_PER_DAY = 86_400_000;

/**
 * Stages are surfaced when ongoing or upcoming; `past` only appears when a
 * dev-tooling phase override is applied (see `devPhaseOverride.ts`). Sharing
 * `EventLifecycleStatus` keeps the override and the per-event status on the
 * same vocabulary.
 */
export type StageStatus = EventLifecycleStatus;

export type StageContext = {
  id: string;
  titre: string;
  /**
   * Phase the UI should display. Equals `realStatus` unless a dev phase
   * override is in effect, in which case it reflects the override.
   */
  status: StageStatus;
  /**
   * Underlying phase derived purely from event dates, ignoring any override.
   * Surfaced separately so the override toggle can mark which option is the
   * "real" one without losing the effective `status` semantics.
   */
  realStatus: StageStatus;
  startDate: Date;
  endDate: Date;
  startsInDays: number;
};

export type ResolveStageContextOptions = {
  now?: Date;
  /**
   * Forces the returned `status` (the candidate stage is still selected from
   * real data — only the perceived phase changes). Used by the dev override.
   */
  phaseOverride?: EventLifecycleStatus | null;
};

/**
 * Resolves the stage the workspace should surface: an ongoing stage takes
 * precedence; otherwise the next stage starting within STAGE_UPCOMING_WINDOW_DAYS.
 *
 * Candidates include any stage that either (a) has an explicit endDate still
 * in the future — ongoing regardless of start — or (b) has no endDate but
 * started within the default duration window, or (c) starts within the
 * lookahead window.
 */
export async function resolveStageContext(
  db: ScopedPrismaClient,
  options: ResolveStageContextOptions = {},
): Promise<StageContext | null> {
  const now = options.now ?? new Date();
  const override = options.phaseOverride ?? null;
  const implicitLookback = addDays(now, -STAGE_DEFAULT_DURATION_DAYS);
  const lookahead = addDays(now, STAGE_UPCOMING_WINDOW_DAYS);

  const candidates = await db.event.findMany({
    where: {
      eventType: EVENT_TYPES.STAGE_SECONDE,
      date: { lte: lookahead },
      OR: [
        { endDate: { gte: now } },
        { endDate: null, date: { gte: implicitLookback } },
      ],
    },
    select: { id: true, titre: true, date: true, endDate: true },
    orderBy: { date: 'asc' },
  });

  let nextUpcoming: (typeof candidates)[number] | null = null;

  for (const event of candidates) {
    const endDate =
      event.endDate ?? addDays(event.date, STAGE_DEFAULT_DURATION_DAYS);
    const hasStarted = event.date.getTime() <= now.getTime();
    const hasEnded = endDate.getTime() < now.getTime();

    if (hasStarted && !hasEnded) {
      return {
        id: event.id,
        titre: event.titre,
        status: override ?? 'ongoing',
        realStatus: 'ongoing',
        startDate: event.date,
        endDate,
        startsInDays: 0,
      };
    }

    if (!hasStarted && !nextUpcoming) {
      nextUpcoming = event;
    }
  }

  if (!nextUpcoming) return null;

  const endDate =
    nextUpcoming.endDate ??
    addDays(nextUpcoming.date, STAGE_DEFAULT_DURATION_DAYS);

  return {
    id: nextUpcoming.id,
    titre: nextUpcoming.titre,
    status: override ?? 'upcoming',
    realStatus: 'upcoming',
    startDate: nextUpcoming.date,
    endDate,
    startsInDays: daysUntil(nextUpcoming.date, now),
  };
}

/**
 * Whole days from `now` to `date`, clamped at 0 (a date today or in the past
 * reads "0", never negative). Calendar-day-naive by design: it rounds the raw
 * span up, matching `startsInDays` and the "J-X" countdown shown across the
 * dev workspace — not a timezone-aware day-boundary count. Single producer for
 * the `{{jours_restants}}` relance/broadcast variable so every surface agrees.
 */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY));
}

/**
 * Days until the talent's soonest stage de seconde that hasn't ended yet, or
 * null when they have none. Drives `{{jours_restants}}` on the student fiche,
 * where (unlike the event onboarding page) the relevant stage isn't pinned by
 * the URL. Shared by the page load (preview) and the send action so both show
 * the same number. Candidate filter mirrors `resolveStageContext`: multi-day
 * stages still running, plus single-day ones within their default duration.
 */
export async function daysUntilTalentStage(
  db: ScopedPrismaClient,
  talentId: string,
  now: Date = new Date(),
): Promise<number | null> {
  const next = await db.participation.findFirst({
    where: {
      talentId,
      event: {
        eventType: EVENT_TYPES.STAGE_SECONDE,
        OR: [
          { endDate: { gte: now } },
          {
            endDate: null,
            date: { gte: addDays(now, -STAGE_DEFAULT_DURATION_DAYS) },
          },
        ],
      },
    },
    orderBy: { event: { date: 'asc' } },
    select: { event: { select: { date: true } } },
  });
  return next ? daysUntil(next.event.date, now) : null;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export type EventRecord = {
  id: string;
  titre: string;
  date: Date;
  endDate: Date | null;
  eventType: string;
  campusId: string;
  externalId: string | null;
};

export async function loadEventOr404(
  eventId: string,
  campusId: string,
): Promise<EventRecord> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      titre: true,
      date: true,
      endDate: true,
      eventType: true,
      campusId: true,
      externalId: true,
    },
  });
  if (!event || event.campusId !== campusId) {
    throw error(404, 'Événement introuvable.');
  }
  return event;
}

export async function loadStageOr404(
  eventId: string,
  campusId: string,
  notFoundMessage = 'Cette page est réservée aux stages de seconde.',
): Promise<EventRecord> {
  const event = await loadEventOr404(eventId, campusId);
  if (event.eventType !== EVENT_TYPES.STAGE_SECONDE) {
    throw error(404, notFoundMessage);
  }
  return event;
}

export function stageEndOrDefault(event: {
  date: Date;
  endDate: Date | null;
}): Date {
  if (event.endDate) return event.endDate;
  return addDays(event.date, STAGE_DEFAULT_DURATION_DAYS);
}
