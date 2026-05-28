import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { eventSchema, startTimeSchema } from '$lib/validation/events';
import { EventService } from '$lib/server/services/events';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
  type ScopedPrismaClient,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  EVENT_TYPES,
  eventTypeHasTheme,
  effectiveStartMinutes,
} from '$lib/domain/event';
import { composeEventStartInstant } from '$lib/server/eventTime';
import {
  applyPhaseOverride,
  getEventStatus,
  getLifecycleBounds,
  type LifecycleBounds,
} from '$lib/domain/eventLifecycle';
import { stageEndOrDefault } from '$lib/server/services/stageContext';
import { deriveEventAlerts } from '$lib/server/services/eventTasks';
import { getEventOrgaSlotsWithCounts } from '$lib/domain/presences';
import {
  imageRightsCompliantWhere,
  rulesCompliantWhere,
} from '$lib/server/db/stageCompliance';

const MS_PER_DAY = 86_400_000;

type EventForLoader = {
  id: string;
  titre: string;
  eventType: string;
  date: Date;
  startMinutes: number | null;
  endDate: Date | null;
  notes: string | null;
};

export const load: PageServerLoad = async ({ locals, params }) => {
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);
  const tz = getCampusTimezone(locals);

  let event;
  try {
    event = await db.event.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        theme: true,
        mantas: { include: { staffProfile: { include: { user: true } } } },
      },
    });
  } catch {
    throw error(404, 'Événement introuvable');
  }

  const canHaveTheme = eventTypeHasTheme(event.eventType);
  const themes = canHaveTheme
    ? await db.theme.findMany({ orderBy: { nom: 'asc' } })
    : [];

  const editForm = await buildEditForm(event);

  const bounds = getLifecycleBounds(tz);
  const status = applyPhaseOverride(
    getEventStatus(event, bounds),
    locals.stagePhaseOverride,
  );
  const isStage = event.eventType === EVENT_TYPES.STAGE_SECONDE;
  const baseLoader = { db, event, bounds, basePath: '/staff/dev', tz };

  if (!isStage) {
    const legacy = await loadLegacyEvent(baseLoader);
    return {
      kind: 'event' as const,
      status,
      legacy,
      event,
      themes,
      editForm,
      timezone: tz,
    };
  }

  const currentStaffProfileId = locals.staffProfile?.id ?? null;

  if (status === 'upcoming') {
    const prep = await loadStagePrep(baseLoader);
    return {
      kind: 'stage' as const,
      status,
      prep,
      event,
      themes,
      editForm,
      timezone: tz,
    };
  }

  if (status === 'ongoing') {
    const ongoing = await loadStageOngoing(baseLoader, currentStaffProfileId);
    return {
      kind: 'stage' as const,
      status,
      ongoing,
      event,
      themes,
      editForm,
      timezone: tz,
    };
  }

  const past = await loadStagePast(baseLoader);
  return {
    kind: 'stage' as const,
    status,
    past,
    event,
    themes,
    editForm,
    timezone: tz,
  };
};

// ─── Loaders ─────────────────────────────────────────────────────────────

type LoaderCtx = {
  db: ScopedPrismaClient;
  event: EventForLoader;
  bounds: LifecycleBounds;
  basePath: string;
  tz: string;
};

async function loadLegacyEvent(ctx: LoaderCtx) {
  const { db, event, bounds } = ctx;
  const [total, bringPc, alerts] = await Promise.all([
    db.participation.count({ where: { eventId: event.id } }),
    db.participation.count({
      where: { eventId: event.id, bringPc: true },
    }),
    deriveEventAlerts(db, event, { basePath: ctx.basePath, bounds }),
  ]);

  return {
    stats: { total, bringPc },
    alerts,
  };
}

async function loadStagePrep(ctx: LoaderCtx) {
  const { db, event, bounds } = ctx;
  const [total, dossiersAdmin, lyceesBreakdown, interestsCloud] =
    await Promise.all([
      db.participation.count({ where: { eventId: event.id } }),
      // Validation funnel only — bringing a PC is logistics (we just plan
      // the laptops), not a doc to validate.
      // "Dossier admin" = both gates green: règlement OR offline-fallback,
      // AND image-rights decided (refusal counts as decided).
      db.participation.count({
        where: {
          eventId: event.id,
          AND: [rulesCompliantWhere, imageRightsCompliantWhere],
        },
      }),
      loadLyceesBreakdown(db, event.id),
      loadInterestsCloud(db, event.id),
    ]);

  const daysToStart = Math.max(
    0,
    Math.ceil((event.date.getTime() - bounds.now.getTime()) / MS_PER_DAY),
  );

  // The countdown ticks to the *effective* start (confirmed time, else type
  // default), composed into a real instant in the campus tz. Whether that time
  // is confirmed or still a default is a display concern — the hero reads it
  // off the raw `event.startMinutes` (null = unconfirmed), already on the page.
  const effectiveStart = effectiveStartMinutes(
    event.eventType,
    event.startMinutes,
  );

  return {
    kpis: { total, dossiersAdmin },
    lyceesBreakdown,
    interestsCloud,
    daysToStart,
    openDate: composeEventStartInstant(event.date, effectiveStart, ctx.tz),
  };
}

async function loadStageOngoing(
  ctx: LoaderCtx,
  currentStaffProfileId: string | null,
) {
  const { db, event, bounds } = ctx;

  const [
    total,
    interviewsCompleted,
    interviewsTotal,
    alerts,
    orgaSlots,
    todayTimeSlots,
    mesProchainsEntretiens,
    lyceesBreakdown,
    interestsCloud,
  ] = await Promise.all([
    db.participation.count({ where: { eventId: event.id } }),
    db.interview.count({
      where: { participation: { eventId: event.id }, status: 'completed' },
    }),
    db.interview.count({
      where: { participation: { eventId: event.id } },
    }),
    deriveEventAlerts(db, event, {
      basePath: ctx.basePath,
      bounds,
      forStaffProfileId: currentStaffProfileId ?? undefined,
    }),
    getEventOrgaSlotsWithCounts(event.id, db, bounds.now),
    db.timeSlot.findMany({
      where: {
        planning: { eventId: event.id },
        startTime: { gte: bounds.startOfDay, lte: bounds.endOfDay },
      },
      include: {
        activity: {
          include: { activityThemes: { include: { theme: true } } },
        },
      },
      orderBy: { startTime: 'asc' },
    }),
    currentStaffProfileId
      ? db.interview.findMany({
          where: {
            staffId: currentStaffProfileId,
            status: 'planned',
            participation: { eventId: event.id },
            date: { gte: bounds.now },
          },
          include: { talent: true },
          orderBy: { date: 'asc' },
          take: 5,
        })
      : Promise.resolve([]),
    loadLyceesBreakdown(db, event.id),
    loadInterestsCloud(db, event.id),
  ]);

  const stageEnd = stageEndOrDefault(event);
  const stageStart = event.date;
  const totalDays = Math.max(
    1,
    Math.ceil((stageEnd.getTime() - stageStart.getTime()) / MS_PER_DAY),
  );
  const dayN = Math.min(
    totalDays,
    Math.max(
      1,
      Math.ceil(
        (bounds.endOfDay.getTime() - stageStart.getTime()) / MS_PER_DAY,
      ),
    ),
  );

  // Today's most recent past or live orga slot — present count.
  const todayOrgaSlots = orgaSlots
    .filter(
      (s) => s.startTime >= bounds.startOfDay && s.startTime <= bounds.endOfDay,
    )
    .filter((s) => s.status === 'past' || s.status === 'live');
  const todayPresenceSlot =
    todayOrgaSlots.length > 0
      ? todayOrgaSlots[todayOrgaSlots.length - 1]
      : null;

  return {
    kpis: {
      total,
      interviewsCompleted,
      interviewsTotal,
      todayPresence: todayPresenceSlot
        ? {
            slotName: todayPresenceSlot.nom,
            present: todayPresenceSlot.presentCount,
            total: todayPresenceSlot.totalCount,
          }
        : null,
    },
    alerts,
    todayTimeSlots,
    mesProchainsEntretiens,
    lyceesBreakdown,
    interestsCloud,
    dayN,
    totalDays,
  };
}

async function loadStagePast({ db, event }: LoaderCtx) {
  const [total, interviewsCompleted, chartes, droitsImage, bringPc] =
    await Promise.all([
      db.participation.count({ where: { eventId: event.id } }),
      db.interview.count({
        where: { participation: { eventId: event.id }, status: 'completed' },
      }),
      db.participation.count({
        where: { eventId: event.id, ...rulesCompliantWhere },
      }),
      db.participation.count({
        where: { eventId: event.id, ...imageRightsCompliantWhere },
      }),
      db.participation.count({
        where: { eventId: event.id, bringPc: true },
      }),
    ]);

  return {
    stats: {
      total,
      bringPc,
      chartes,
      droitsImage,
      interviewsCompleted,
    },
    endDate: stageEndOrDefault(event),
  };
}

// ─── Helpers for prep view ───────────────────────────────────────────────

/**
 * Cap shown rows for both breakdown sections at the same N. Keeps the two
 * cards visually balanced side-by-side and protects the page layout when a
 * cohort spans many lycées or picks across the full interest catalogue.
 * The tail is summarised in a non-clickable footer row by the components.
 */
const BREAKDOWN_TOP_N = 10;

type LyceeBreakdownRow = { schoolId: string; name: string; count: number };
type InterestBreakdownRow = {
  interestId: string;
  nom: string;
  emoji: string | null;
  count: number;
};

/**
 * Tail aggregate. `count` semantics differ per section:
 *   - lycées: unique talents (each talent has one lycée),
 *   - interests: declarations (a talent picking 3 tail interests adds 3).
 * The components label this accordingly.
 */
type BreakdownTail = { count: number; categories: number };

export type LyceesBreakdown = {
  rows: LyceeBreakdownRow[];
  others: BreakdownTail | null;
};

export type InterestsBreakdown = {
  rows: InterestBreakdownRow[];
  others: BreakdownTail | null;
};

async function loadLyceesBreakdown(
  db: ScopedPrismaClient,
  eventId: string,
): Promise<LyceesBreakdown> {
  const grouped = await db.talent.groupBy({
    by: ['schoolId'],
    where: {
      schoolId: { not: null },
      participations: { some: { eventId } },
    },
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
  });

  if (grouped.length === 0) return { rows: [], others: null };

  const top = grouped.slice(0, BREAKDOWN_TOP_N);
  const tail = grouped.slice(BREAKDOWN_TOP_N);

  // Resolve display names for the top schools. `School` is a global reference
  // table (not campus-scoped), so it's read off the unscoped client. Talents
  // with a free-text lycée (no UAI → no School row) aren't grouped here: the
  // cohort breakdown covers resolved establishments only.
  const ids = top
    .map((g) => g.schoolId)
    .filter((id): id is string => id !== null);
  const schools = await prisma.school.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = new Map(schools.map((s) => [s.id, s.name]));

  const rows = top
    .filter((g): g is typeof g & { schoolId: string } => g.schoolId !== null)
    .map((g) => ({
      schoolId: g.schoolId,
      name: nameById.get(g.schoolId) ?? '—',
      count: g._count._all,
    }));

  const others =
    tail.length === 0
      ? null
      : {
          count: tail.reduce((sum, g) => sum + g._count._all, 0),
          categories: tail.length,
        };

  return { rows, others };
}

async function loadInterestsCloud(
  db: ScopedPrismaClient,
  eventId: string,
): Promise<InterestsBreakdown> {
  const grouped = await db.talentInterest.groupBy({
    by: ['interestId'],
    where: { talent: { participations: { some: { eventId } } } },
    _count: { _all: true },
    orderBy: { _count: { interestId: 'desc' } },
  });

  if (grouped.length === 0) return { rows: [], others: null };

  const top = grouped.slice(0, BREAKDOWN_TOP_N);
  const tail = grouped.slice(BREAKDOWN_TOP_N);

  const interests = await db.interest.findMany({
    where: { id: { in: top.map((g) => g.interestId) } },
  });
  const byId = new Map(interests.map((i) => [i.id, i]));

  const rows = top.flatMap((g) => {
    const i = byId.get(g.interestId);
    if (!i) return [];
    return [
      {
        interestId: i.id,
        nom: i.nom,
        emoji: i.emoji,
        count: g._count._all,
      },
    ];
  });

  const others =
    tail.length === 0
      ? null
      : {
          count: tail.reduce((sum, g) => sum + g._count._all, 0),
          categories: tail.length,
        };

  return { rows, others };
}

// ─── Edit form ───────────────────────────────────────────────────────────

async function buildEditForm(event: {
  theme: { nom: string } | null;
  notes: string | null;
}) {
  return superValidate(
    {
      theme: event.theme?.nom || '',
      notes: event.notes || '',
    },
    zod4(eventSchema),
  );
}

// ─── Actions ─────────────────────────────────────────────────────────────

export const actions: Actions = {
  updateEvent: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devLead');
    const form = await superValidate(request, zod4(eventSchema));
    if (!form.valid) return fail(400, { form });

    await EventService.updateEvent(params.id, getCampusId(locals), form.data);

    return message(form, 'Événement mis à jour !');
  },

  // Focused writer for the Jump-owned start time-of-day (its own action so
  // editing notes/theme can never touch it). Empty `startTime` clears it back
  // to the type default.
  setStartTime: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devLead');
    const form = await superValidate(request, zod4(startTimeSchema));
    if (!form.valid) return fail(400, { form });

    await EventService.setStartTime(
      params.id,
      getCampusId(locals),
      form.data.startTime,
    );

    return message(form, 'Horaire enregistré.');
  },
};
