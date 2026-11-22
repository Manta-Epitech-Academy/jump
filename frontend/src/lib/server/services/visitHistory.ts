import { prisma } from '#lib/server/db.ts';
import { attendedShownBeforeWhere } from '#lib/domain/attendance.ts';

/**
 * How many times each talent had come to an event on the campus before a given
 * date: the count behind the parcours (`#lib/domain/visitHistory`).
 *
 * « Came » is `attendedShownBeforeWhere`'s: a proof of attendance on an event
 * over before `before`, the start of the event being looked at, so a past
 * event's roster reads as it stood then and two events on the same day are not
 * each other's history. Only the enrolments the dev space shows count, on the
 * events it shows, as everywhere in that space: a visit to an event no admin
 * activated is no « Déjà venu » (#516).
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
      ...attendedShownBeforeWhere(before),
    },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.talentId, g._count._all]));
}
