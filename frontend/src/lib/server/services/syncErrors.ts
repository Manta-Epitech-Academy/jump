import { prisma } from '$lib/server/db';
import { EVENT_TYPES } from '$lib/domain/event';

/**
 * Tally of unresolved Salesforce sync errors visible to a campus's dev team.
 * `urgent` counts the subset whose colliding event is a stage de seconde — a
 * blocked stage import stalls compliance/diploma workflows, so the admissions
 * team needs to triage those first.
 *
 * Categorization keys off the colliding event (`SyncError.eventExtId`), not the
 * talents involved: when a collision is logged neither talent yet has a
 * participation on that event, so their participations can't tell us what kind
 * of import was blocked — the event's own `eventType` is the authoritative
 * signal.
 */
export async function countCampusSyncErrors(
  campusId: string,
): Promise<{ total: number; urgent: number }> {
  const events = await prisma.event.findMany({
    where: { campusId, externalId: { not: null } },
    select: { externalId: true, eventType: true },
  });
  if (!events.length) return { total: 0, urgent: 0 };

  const eventExtIds = events.map((e) => e.externalId as string);
  const stageExtIds = events
    .filter((e) => e.eventType === EVENT_TYPES.STAGE_SECONDE)
    .map((e) => e.externalId as string);

  const [total, urgent] = await Promise.all([
    prisma.syncError.count({
      where: { resolved: false, eventExtId: { in: eventExtIds } },
    }),
    stageExtIds.length
      ? prisma.syncError.count({
          where: { resolved: false, eventExtId: { in: stageExtIds } },
        })
      : Promise.resolve(0),
  ]);

  return { total, urgent };
}
