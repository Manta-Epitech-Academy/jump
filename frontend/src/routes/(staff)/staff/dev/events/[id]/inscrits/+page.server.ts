import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { getTotalXp, getXpEligibleActivities } from '$lib/domain/xp';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { prisma } from '$lib/server/db';
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
import { computeIsNewTalent } from './components/types';
import type { OngoingRow, PrepRow } from './components/types';

function originConditions(lyceeName: string | null, interestId: string | null) {
  const conds: object[] = [];
  if (lyceeName) conds.push({ talent: { highSchoolName: lyceeName } });
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
  const lyceeName = url.searchParams.get('lycee');
  const interestId = url.searchParams.get('interest');

  const [activeLycee, activeInterest] = await Promise.all([
    lyceeName ? Promise.resolve({ nom: lyceeName }) : Promise.resolve(null),
    interestId
      ? db.interest.findUnique({
          where: { id: interestId },
          select: { id: true, nom: true, emoji: true },
        })
      : Promise.resolve(null),
  ]);
  const origin = {
    lycee: activeLycee,
    interest: activeInterest,
  };
  const originAnd = originConditions(
    activeLycee?.nom ?? null,
    activeInterest?.id ?? null,
  );

  if (phase === 'upcoming') {
    const scopedAnd = [{ eventId: event.id }, ...originAnd];
    const filteredWhere =
      scopedAnd.length === 1 ? scopedAnd[0] : { AND: scopedAnd };

    const participations = await db.participation.findMany({
      where: filteredWhere,
      include: {
        talent: {
          include: {
            interests: { include: { interest: true } },
          },
        },
      },
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
    include: {
      talent: {
        include: {
          interests: { include: { interest: true } },
        },
      },
      interview: {
        select: {
          id: true,
          status: true,
          date: true,
          recommendation: true,
        },
      },
    },
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
  const priorActivities = await db.participationActivity.findMany({
    where: {
      isPresent: true,
      participation: {
        talentId: { in: talentIds },
        eventId: { not: currentEventId },
      },
    },
    select: {
      activity: {
        select: {
          nom: true,
          timeSlot: { select: { startTime: true } },
        },
      },
      participation: { select: { talentId: true } },
    },
    orderBy: { activity: { timeSlot: { startTime: 'desc' } } },
  });
  const out = new Map<string, { name: string; at: Date }>();
  for (const pa of priorActivities) {
    const tid = pa.participation.talentId;
    if (!out.has(tid)) {
      out.set(tid, {
        name: pa.activity.nom,
        at: pa.activity.timeSlot.startTime,
      });
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
        include: { activities: { include: { activity: true } } },
      });

      if (p.isPresent) {
        const xpValue = getTotalXp(getXpEligibleActivities(p.activities));
        const profile = await prisma.talent.findUniqueOrThrow({
          where: { id: p.talentId },
          select: { xp: true, eventsCount: true },
        });
        await prisma.talent.update({
          where: { id: p.talentId },
          data: {
            xp: Math.max(0, profile.xp - xpValue),
            eventsCount: Math.max(0, profile.eventsCount - 1),
          },
        });
      }

      await prisma.participation.delete({ where: { id } });
      return { success: true };
    } catch {
      return fail(500);
    }
  },
};
