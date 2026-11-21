import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { attendedShownBeforeWhere } from '$lib/domain/attendance';
import { toDateKey } from '$lib/domain/planningTime';
import { workshopSlugFromSourceId } from '$lib/domain/workshops';
import {
  buildParcours,
  type Parcours,
  type ParcoursEarned,
  type ParcoursEventFacts,
} from '$lib/domain/talentParcours';
import { shownEventWhere } from '$lib/domain/eventReadiness';
import { enrolledNotOverWhere } from '$lib/server/services/talentHomeHero';
import { listTalentWorkshops } from '$lib/server/services/workshopService';
import { resolveGrantLabels } from '$lib/server/services/xpStoryService';

/**
 * The facts behind a talent's « Mon parcours » (#445), arranged by
 * `buildParcours`. Three rules, each read where it is owned:
 *
 * - « Venu » is `attendedShownBeforeWhere`, the dev space's own, so the talent
 *   and the recruiter reading their fiche count the same visits (#491).
 * - « Inscrit » is the home hero's (`enrolledNotOverWhere`): an enrolment the
 *   dev space shows.
 * - Only events an admin activated (`shownEventWhere`) are read at all:
 *   nobody but an admin is shown another, and activating one asks for its
 *   public name.
 *
 * XP outside an event (the daily game, onboarding, rankings, adjustments) is
 * in the level's total and nowhere here: the mockup tells the journey by
 * event.
 */
const PARCOURS_EVENT_SELECT = {
  id: true,
  publicName: true,
  date: true,
  endDate: true,
  startMinutes: true,
  campus: { select: { timezone: true } },
  category: { select: { color: true, keyEvent: true } },
} satisfies Prisma.EventSelect;

type ParcoursEventRow = Prisma.EventGetPayload<{
  select: typeof PARCOURS_EVENT_SELECT;
}>;

function factsOf(row: ParcoursEventRow): ParcoursEventFacts {
  const timezone = row.campus.timezone;
  return {
    id: row.id,
    publicName: row.publicName,
    date: toDateKey(row.date, timezone),
    endDate: row.endDate && toDateKey(row.endDate, timezone),
    startMinutes: row.startMinutes,
    timezone,
    category: row.category,
  };
}

export async function loadTalentParcours(
  talentId: string,
  now: Date = new Date(),
): Promise<Parcours> {
  const visible = { event: shownEventWhere };
  const [attended, enrolled, grants, workshops] = await Promise.all([
    prisma.participation.findMany({
      where: { talentId, ...attendedShownBeforeWhere(now) },
      select: { event: { select: PARCOURS_EVENT_SELECT } },
    }),
    prisma.participation.findMany({
      where: { AND: [enrolledNotOverWhere(talentId, now), visible] },
      select: { event: { select: PARCOURS_EVENT_SELECT } },
    }),
    // One grant per walked activity, pinned to the event the walk began at.
    prisma.xpGrant.findMany({
      where: { talentId, source: 'workshop', event: shownEventWhere },
      orderBy: { createdAt: 'asc' },
      select: {
        source: true,
        sourceId: true,
        amount: true,
        event: { select: PARCOURS_EVENT_SELECT },
      },
    }),
    listTalentWorkshops(talentId, now),
  ]);

  const events = new Map<string, ParcoursEventFacts>();
  for (const row of [
    ...attended.map((p) => p.event),
    ...enrolled.map((p) => p.event),
    ...grants.flatMap((g) => (g.event ? [g.event] : [])),
  ]) {
    events.set(row.id, factsOf(row));
  }

  const offered = [...workshops.today, ...workshops.activities];
  const unread = [
    ...new Set(offered.map((a) => a.eventId).filter((id) => !events.has(id))),
  ];
  if (unread.length > 0) {
    const rows = await prisma.event.findMany({
      where: { id: { in: unread }, ...shownEventWhere },
      select: PARCOURS_EVENT_SELECT,
    });
    for (const row of rows) events.set(row.id, factsOf(row));
  }

  const labels = await resolveGrantLabels(talentId, grants);
  const earned = grants.flatMap((grant): ParcoursEarned[] => {
    const slug = workshopSlugFromSourceId(grant.sourceId);
    if (!grant.event || !slug || !grant.sourceId) return [];
    return [
      {
        eventId: grant.event.id,
        slug,
        label: labels.get(grant.sourceId) ?? slug,
        xp: grant.amount,
      },
    ];
  });

  return buildParcours({
    now,
    events,
    attended: attended.map((p) => p.event.id),
    enrolled: enrolled.map((p) => p.event.id),
    earned,
    workshops,
  });
}
