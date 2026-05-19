import { prisma } from '$lib/server/db';
import { EVENT_TYPES } from '$lib/domain/event';

/**
 * Tally of unresolved Salesforce sync errors visible to a campus's dev team.
 * `urgent` counts the subset where at least one colliding talent has a
 * stage-de-seconde participation — that's the cohort the admissions team
 * needs to triage first.
 */
export async function countCampusSyncErrors(
  campusId: string,
): Promise<{ total: number; urgent: number }> {
  const events = await prisma.event.findMany({
    where: { campusId, externalId: { not: null } },
    select: { externalId: true },
  });
  const eventExtIds = events
    .map((e) => e.externalId)
    .filter((x): x is string => !!x);
  if (!eventExtIds.length) return { total: 0, urgent: 0 };

  const errors = await prisma.syncError.findMany({
    where: { resolved: false, eventExtId: { in: eventExtIds } },
    select: { attemptedExtId: true, existingExtId: true },
  });
  if (!errors.length) return { total: 0, urgent: 0 };

  const extIds = [
    ...new Set(
      errors
        .flatMap((e) => [e.attemptedExtId, e.existingExtId])
        .filter(Boolean),
    ),
  ] as string[];
  const talents = await prisma.talent.findMany({
    where: { externalId: { in: extIds } },
    select: {
      externalId: true,
      participations: {
        select: { event: { select: { eventType: true } } },
      },
    },
  });
  const isStageByExtId = new Map<string, boolean>();
  for (const t of talents) {
    if (!t.externalId) continue;
    isStageByExtId.set(
      t.externalId,
      t.participations.some(
        (p) => p.event.eventType === EVENT_TYPES.STAGE_SECONDE,
      ),
    );
  }

  let urgent = 0;
  for (const e of errors) {
    const a = isStageByExtId.get(e.attemptedExtId) ?? false;
    const ex = e.existingExtId
      ? (isStageByExtId.get(e.existingExtId) ?? false)
      : false;
    if (a || ex) urgent++;
  }

  return { total: errors.length, urgent };
}
