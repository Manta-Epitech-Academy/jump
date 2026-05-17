import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { eventSchema } from '$lib/validation/events';
import { EventService } from '$lib/server/services/events';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
  type ScopedPrismaClient,
} from '$lib/server/db/scoped';
import { CalendarDateTime } from '@internationalized/date';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { EVENT_TYPES } from '$lib/domain/event';
import {
  applyPhaseOverride,
  getDayBounds,
  getEventStatus,
  getLifecycleBounds,
  type LifecycleBounds,
} from '$lib/domain/eventLifecycle';
import { stageEndOrDefault } from '$lib/server/services/stageContext';
import {
  deriveEventAlerts,
  deriveEventChecklist,
} from '$lib/server/services/eventTasks';
import { getEventOrgaSlotsWithCounts } from '$lib/domain/presences';

const MS_PER_DAY = 86_400_000;

type EventForLoader = {
  id: string;
  titre: string;
  eventType: string;
  date: Date;
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

  const themes = await db.theme.findMany({ orderBy: { nom: 'asc' } });
  const assignedMantaIds = event.mantas.map((m) => m.staffProfileId);
  const staff = await db.staffProfile.findMany({
    where: {
      OR: [
        { staffRole: { in: ['manta', 'peda'] } },
        { id: { in: assignedMantaIds } },
      ],
    },
    include: { user: true },
    orderBy: { user: { name: 'asc' } },
  });

  const editForm = await buildEditForm(event, staff, tz);

  const bounds = getLifecycleBounds(tz);
  const status = applyPhaseOverride(
    getEventStatus(event, bounds),
    locals.stagePhaseOverride,
  );
  const isStage = event.eventType === EVENT_TYPES.STAGE_SECONDE;
  const baseLoader = { db, event, bounds, basePath: '/staff/dev' };

  if (!isStage) {
    const legacy = await loadLegacyEvent(baseLoader);
    return {
      kind: 'event' as const,
      status,
      legacy,
      event,
      themes,
      staff,
      editForm,
      timezone: tz,
    };
  }

  const currentStaffProfileId = locals.staffProfile?.id ?? null;

  if (status === 'upcoming') {
    const prep = await loadStagePrep(baseLoader, tz);
    return {
      kind: 'stage' as const,
      status,
      prep,
      event,
      themes,
      staff,
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
      staff,
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
    staff,
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

async function loadStagePrep(ctx: LoaderCtx, timezone: string) {
  const { db, event, bounds } = ctx;
  const firstDayBounds = getDayBounds(event.date, timezone);
  const [
    total,
    comptesActives,
    profilComplete,
    dossiersAdmin,
    checklist,
    lyceesBreakdown,
    interestsCloud,
    firstDayTimeSlots,
  ] = await Promise.all([
    db.participation.count({ where: { eventId: event.id } }),
    db.participation.count({
      where: { eventId: event.id, talent: { userId: { not: null } } },
    }),
    db.participation.count({
      where: {
        eventId: event.id,
        talent: {
          infoValidatedAt: { not: null },
          rulesSignedAt: { not: null },
          charterAcceptedAt: { not: null },
        },
      },
    }),
    // Validation funnel only — bringing a PC is logistics (we just plan
    // the laptops), not a doc to validate.
    db.participation.count({
      where: {
        eventId: event.id,
        stageCompliance: {
          charteSigned: true,
          imageRightsSigned: true,
        },
      },
    }),
    deriveEventChecklist(db, event, { basePath: ctx.basePath, bounds }),
    loadLyceesBreakdown(db, event.id),
    loadInterestsCloud(db, event.id),
    db.timeSlot.findMany({
      where: {
        planning: { eventId: event.id },
        startTime: {
          gte: firstDayBounds.startOfDay,
          lte: firstDayBounds.endOfDay,
        },
      },
      include: {
        activity: {
          include: { activityThemes: { include: { theme: true } } },
        },
      },
      orderBy: { startTime: 'asc' },
    }),
  ]);

  const daysToStart = Math.max(
    0,
    Math.ceil((event.date.getTime() - bounds.now.getTime()) / MS_PER_DAY),
  );

  return {
    kpis: { total, comptesActives, profilComplete, dossiersAdmin },
    checklist,
    lyceesBreakdown,
    interestsCloud,
    firstDayTimeSlots,
    daysToStart,
    openDate: event.date,
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
    chartes,
    droitsImage,
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
    db.participation.count({
      where: {
        eventId: event.id,
        stageCompliance: { charteSigned: true },
      },
    }),
    db.participation.count({
      where: {
        eventId: event.id,
        stageCompliance: { imageRightsSigned: true },
      },
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

  // Average over the two validation docs only — `bringPc` is logistics,
  // not part of the conformity score.
  const conformitePct = total === 0 ? 0 : (chartes + droitsImage) / (total * 2);

  return {
    kpis: {
      total,
      interviewsCompleted,
      interviewsTotal,
      conformitePct,
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
        where: {
          eventId: event.id,
          stageCompliance: { charteSigned: true },
        },
      }),
      db.participation.count({
        where: {
          eventId: event.id,
          stageCompliance: { imageRightsSigned: true },
        },
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

type LyceeBreakdownRow = { highSchoolName: string; count: number };
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
    by: ['highSchoolName'],
    where: {
      highSchoolName: { not: null },
      participations: { some: { eventId } },
    },
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
  });

  if (grouped.length === 0) return { rows: [], others: null };

  const top = grouped.slice(0, BREAKDOWN_TOP_N);
  const tail = grouped.slice(BREAKDOWN_TOP_N);

  const rows = top
    .filter(
      (g): g is typeof g & { highSchoolName: string } =>
        g.highSchoolName !== null,
    )
    .map((g) => ({ highSchoolName: g.highSchoolName, count: g._count._all }));

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

async function buildEditForm(
  event: {
    titre: string;
    theme: { nom: string } | null;
    date: Date;
    endDate: Date | null;
    notes: string | null;
    mantas: { staffProfileId: string }[];
  },
  staff: { id: string }[],
  tz: string,
) {
  const dateString = event.date.toISOString().split('T')[0];
  const timeParts = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).formatToParts(event.date);
  const hours = timeParts.find((p) => p.type === 'hour')?.value || '00';
  const minutes = timeParts.find((p) => p.type === 'minute')?.value || '00';
  const timeString = `${hours}:${minutes}`;
  const endDateString = event.endDate
    ? event.endDate.toISOString().split('T')[0]
    : '';

  const staffIds = new Set(staff.map((s) => s.id));
  return superValidate(
    {
      titre: event.titre,
      theme: event.theme?.nom || '',
      date: dateString,
      endDate: endDateString,
      time: timeString,
      notes: event.notes || '',
      mantas: event.mantas
        .map((m) => m.staffProfileId)
        .filter((id) => staffIds.has(id)),
    },
    zod4(eventSchema),
  );
}

// ─── Actions ─────────────────────────────────────────────────────────────

export const actions: Actions = {
  updateEvent: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devLead');
    const formData = await request.formData();
    const dateStr = formData.get('date') as string;
    const timeStr = formData.get('time') as string;
    const endDateStr = formData.get('endDate') as string;

    const transformedData = {
      titre: (formData.get('titre') as string) || '',
      date: dateStr,
      endDate: endDateStr || '',
      time: timeStr,
      theme: formData.get('theme') as string,
      notes: formData.get('notes') as string,
      mantas: formData.getAll('mantas') as string[],
    };

    const form = await superValidate(transformedData, zod4(eventSchema));
    if (!form.valid) return fail(400, { form });

    const tz = getCampusTimezone(locals);
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    const cdt = new CalendarDateTime(year, month, day, hour, minute);
    const jsDate = cdt.toDate(tz);

    let endDateIso: string | undefined;
    if (endDateStr && endDateStr.trim() !== '') {
      const [ey, em, ed] = endDateStr.split('T')[0].split('-').map(Number);
      const endCdt = new CalendarDateTime(ey, em, ed, 23, 59);
      endDateIso = endCdt.toDate(tz).toISOString();
    }

    await EventService.updateEvent(params.id, getCampusId(locals), {
      ...form.data,
      date: jsDate.toISOString(),
      endDate: endDateIso,
    });

    return message(form, 'Événement mis à jour !');
  },

  deleteEvent: async ({ params, locals }) => {
    requireStaffGroup(locals, 'devLead');
    try {
      await EventService.deleteEvent(params.id, getCampusId(locals));
    } catch {
      return fail(500);
    }
    throw redirect(303, resolve('/staff/dev'));
  },
};
