import { prisma } from '$lib/server/db';
import { attendedBeforeWhere } from '$lib/domain/attendance';

/**
 * How many times each talent had come to an event on the campus before a given
 * date: the count behind the parcours (`$lib/domain/visitHistory`).
 *
 * « Came » is `attendedBeforeWhere`'s: a proof of attendance on an event over
 * before `before`, the start of the event being looked at, so a past event's
 * roster reads as it stood then and two events on the same day are not each
 * other's history. Only the enrolments the dev space shows count, as everywhere
 * in that space.
 *
 * One `groupBy` for the whole cohort. It runs on the plain client with the
 * campus written into the filter by hand, because `scopedPrisma` does not scope
 * `participation.groupBy`: a scoped call here would count other campuses.
 */
export async function countPriorVisits(
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
      ...attendedBeforeWhere(before),
    },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.talentId, g._count._all]));
}
