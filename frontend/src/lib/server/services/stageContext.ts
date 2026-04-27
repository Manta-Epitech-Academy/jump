import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import { EVENT_TYPES } from '$lib/domain/event';

export const STAGE_DEFAULT_DURATION_DAYS = 14;
export const STAGE_UPCOMING_WINDOW_DAYS = 60;

const MS_PER_DAY = 86_400_000;

export type StageStatus = 'ongoing' | 'upcoming';

export type StageContext = {
  id: string;
  titre: string;
  status: StageStatus;
  startDate: Date;
  endDate: Date;
  startsInDays: number;
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
  now: Date = new Date(),
): Promise<StageContext | null> {
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
        status: 'ongoing',
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
    status: 'upcoming',
    startDate: nextUpcoming.date,
    endDate,
    startsInDays: Math.ceil(
      (nextUpcoming.date.getTime() - now.getTime()) / MS_PER_DAY,
    ),
  };
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}
