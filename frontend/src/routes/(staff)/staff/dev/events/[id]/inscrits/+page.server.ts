import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { prisma } from '$lib/server/db';
import { revokeXp, recomputeEventsCount } from '$lib/server/services/xpService';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import {
  applyPhaseOverride,
  getEventStatus,
  getLifecycleBounds,
} from '$lib/domain/eventLifecycle';
import { getInterviewDisplayStatus } from '$lib/domain/interview';
import { compareNiveaux } from '$lib/domain/niveau';
import {
  computeIsNewTalent,
  ONGOING_PARTICIPATION_SELECT,
  PREP_PARTICIPATION_SELECT,
} from './components/types';
import type { OngoingRow, PrepRow } from './components/types';

function originConditions(schoolId: string | null, interestId: string | null) {
  const conds: object[] = [];
  if (schoolId) conds.push({ talent: { schoolId } });
  if (interestId)
    conds.push({ talent: { interests: { some: { interestId } } } });
  return conds;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  const db = scopedPrisma(campusId);
  const timezone = getCampusTimezone(locals);
  const bounds = getLifecycleBounds(timezone);
  const phase = applyPhaseOverride(
    getEventStatus(event, bounds),
    locals.stagePhaseOverride,
  );
  // The `lycee` filter param carries a canonical School id; resolve it to a name
  // for the origin chip and filter participations on the talent's schoolId.
  const schoolId = url.searchParams.get('lycee');
  const interestId = url.searchParams.get('interest');

  const [activeSchool, activeInterest] = await Promise.all([
    schoolId
      ? prisma.school.findUnique({
          where: { id: schoolId },
          select: { name: true },
        })
      : Promise.resolve(null),
    interestId
      ? db.interest.findUnique({
          where: { id: interestId },
          select: { id: true, nom: true, emoji: true },
        })
      : Promise.resolve(null),
  ]);
  const origin = {
    lycee: activeSchool ? { nom: activeSchool.name } : null,
    interest: activeInterest,
  };
  const originAnd = originConditions(
    activeSchool ? schoolId : null,
    activeInterest?.id ?? null,
  );

  if (phase === 'upcoming') {
    const scopedAnd = [{ eventId: event.id }, ...originAnd];
    const filteredWhere =
      scopedAnd.length === 1 ? scopedAnd[0] : { AND: scopedAnd };

    const participations = await db.participation.findMany({
      where: filteredWhere,
      select: PREP_PARTICIPATION_SELECT,
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
    });

    const lastSeenByTalent = await loadLastSeenByTalent(
      db,
      participations.map((p) => p.talentId),
      event.id,
    );

    const rows: PrepRow[] = participations.map((p) => {
      const seen = lastSeenByTalent.get(p.talentId) ?? null;
      return {
        participation: p,
        isNewTalent: computeIsNewTalent(p),
        lastSeenName: seen?.name ?? null,
        lastSeenAt: seen?.at ?? null,
      };
    });

    return {
      event,
      timezone,
      origin,
      availableNiveaux: computeAvailableNiveaux(participations),
      variant: { kind: 'prep' as const, rows },
    };
  }

  // ongoing or past — same query shape, card behaviour differs only in tone.
  const ongoingAnd = [{ eventId: event.id }, ...originAnd];
  const ongoingWhere =
    ongoingAnd.length === 1 ? ongoingAnd[0] : { AND: ongoingAnd };
  const participations = await db.participation.findMany({
    where: ongoingWhere,
    select: ONGOING_PARTICIPATION_SELECT,
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const lastActivities = await db.participationActivity.findMany({
    where: {
      participation: { eventId: event.id },
      isPresent: true,
    },
    include: {
      activity: {
        select: {
          nom: true,
          timeSlot: { select: { startTime: true } },
        },
      },
    },
    orderBy: [
      { participationId: 'asc' },
      { activity: { timeSlot: { startTime: 'desc' } } },
    ],
    distinct: ['participationId'],
  });
  const lastByParticipation = new Map(
    lastActivities.map((pa) => [
      pa.participationId,
      { name: pa.activity.nom, at: pa.activity.timeSlot.startTime },
    ]),
  );

  const rows: OngoingRow[] = participations.map((p) => {
    const last = lastByParticipation.get(p.id) ?? null;
    return {
      participation: p,
      isNewTalent: computeIsNewTalent(p),
      interviewStatus: getInterviewDisplayStatus(p.interview, bounds),
      interviewDate: p.interview?.date ?? null,
      interviewRecommendation: p.interview?.recommendation ?? null,
      lastActivityName: last?.name ?? null,
      lastActivityAt: last?.at ?? null,
    };
  });

  return {
    event,
    timezone,
    origin,
    availableNiveaux: computeAvailableNiveaux(participations),
    variant: {
      kind: phase === 'past' ? ('past' as const) : ('ongoing' as const),
      rows,
    },
  };
};

async function loadLastSeenByTalent(
  db: ReturnType<typeof scopedPrisma>,
  talentIds: string[],
  currentEventId: string,
): Promise<Map<string, { name: string; at: Date }>> {
  if (talentIds.length === 0) return new Map();
  // Each prior participation carries only its single latest present activity
  // (bounded by how many past events a talent attended), then we keep the most
  // recent across a talent's participations. This avoids pulling every
  // historical activity row just to dedupe one value per talent in JS.
  const priors = await db.participation.findMany({
    where: {
      talentId: { in: talentIds },
      eventId: { not: currentEventId },
    },
    select: {
      talentId: true,
      activities: {
        where: { isPresent: true },
        orderBy: { activity: { timeSlot: { startTime: 'desc' } } },
        take: 1,
        select: {
          activity: {
            select: {
              nom: true,
              timeSlot: { select: { startTime: true } },
            },
          },
        },
      },
    },
  });
  const out = new Map<string, { name: string; at: Date }>();
  for (const p of priors) {
    const activity = p.activities[0]?.activity;
    if (!activity) continue;
    const at = activity.timeSlot.startTime;
    const existing = out.get(p.talentId);
    if (!existing || at.getTime() > existing.at.getTime()) {
      out.set(p.talentId, { name: activity.nom, at });
    }
  }
  return out;
}

function computeAvailableNiveaux<
  T extends { talent: { niveau: string | null } | null },
>(participations: T[]): string[] {
  return Array.from(
    new Set(
      participations
        .map((p) => p.talent?.niveau)
        .filter((n): n is string => !!n),
    ),
  ).sort(compareNiveaux);
}

export const actions: Actions = {
  toggleBringPc: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const data = await request.formData();
    return toggleBringPc(data, getCampusId(locals), params.id);
  },

  remove: async ({ url, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const id = url.searchParams.get('id');
    if (!id) return fail(400);
    const db = scopedPrisma(getCampusId(locals));

    try {
      const p = await db.participation.findFirstOrThrow({
        where: { id, eventId: params.id },
        select: { id: true, talentId: true, isPresent: true },
      });

      // Campus is authorized by the scoped `db` read above. Revoke the presence
      // grant (keyed on the participation id) before deleting the row, then
      // refresh the cached event count — all atomic.
      await prisma.$transaction(async (tx) => {
        if (p.isPresent) {
          await revokeXp(tx, {
            talentId: p.talentId,
            source: 'activity_presence',
            sourceId: p.id,
          });
        }
        await tx.participation.delete({ where: { id } });
        await recomputeEventsCount(tx, p.talentId);
      });
      return { success: true };
    } catch {
      return fail(500);
    }
  },
};
