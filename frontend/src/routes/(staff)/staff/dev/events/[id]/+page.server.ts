import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
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
import {
  loadLyceesBreakdown,
  loadInterestsCloud,
} from '$lib/server/services/cohortOverview';

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
    const ongoing = await loadStageOngoing(baseLoader);
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

async function loadStageOngoing(ctx: LoaderCtx) {
  const { db, event, bounds } = ctx;

  const [
    total,
    interviewsDone,
    alerts,
    orgaSlots,
    todayTimeSlots,
    lyceesBreakdown,
    interestsCloud,
  ] = await Promise.all([
    db.participation.count({ where: { eventId: event.id } }),
    db.interview.count({
      where: { participation: { eventId: event.id }, status: 'done' },
    }),
    deriveEventAlerts(db, event, { basePath: ctx.basePath, bounds }),
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
      interviewsDone,
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
    lyceesBreakdown,
    interestsCloud,
    dayN,
    totalDays,
  };
}

async function loadStagePast({ db, event }: LoaderCtx) {
  const [total, interviewsDone, chartes, droitsImage, bringPc] =
    await Promise.all([
      db.participation.count({ where: { eventId: event.id } }),
      db.interview.count({
        where: { participation: { eventId: event.id }, status: 'done' },
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
      interviewsDone,
    },
    endDate: stageEndOrDefault(event),
  };
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
