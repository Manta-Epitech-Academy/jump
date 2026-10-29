import { prisma } from '$lib/server/db';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';

/**
 * How many times each talent had enrolled on the campus before a given date:
 * the count behind the parcours (`$lib/domain/enrolmentHistory`).
 *
 * "Before" is the event's day: an enrolment counts when its event is dated
 * strictly earlier, so a past event's roster reads as it stood then, and two
 * events on the same day are not each other's history. Only the enrolments the
 * dev space shows count, as everywhere in that space.
 *
 * One `groupBy` for the whole cohort. It runs on the plain client with the
 * campus written into the filter by hand, because `scopedPrisma` does not scope
 * `participation.groupBy`: a scoped call here would count other campuses.
 */
export async function countPriorEnrolments(
  campusId: string,
  talentIds: readonly string[],
  before: Date,
): Promise<Map<string, number>> {
  if (talentIds.length === 0) return new Map();
  const groups = await prisma.participation.groupBy({
    by: ['talentId'],
    where: {
      campusId,
      talentId: { in: [...talentIds] },
      ...visibleParticipationWhere,
      event: { date: { lt: before } },
    },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.talentId, g._count._all]));
}
