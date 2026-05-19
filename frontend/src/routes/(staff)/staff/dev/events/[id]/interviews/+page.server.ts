import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { CalendarDateTime } from '@internationalized/date';
import {
  Prisma,
  type Interview,
  type InterviewRecommendation,
  type StaffRole,
  type Talent,
} from '@prisma/client';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
  type ScopedPrismaClient,
} from '$lib/server/db/scoped';
import {
  autoScheduleInterviewsSchema,
  interviewGridSchema,
  reassignInterviewSchema,
  scheduleInterviewSchema,
  updateInterviewStatusSchema,
} from '$lib/validation/interviews';
import {
  requireFlag,
  requireInterviewActor,
  requireStaffGroup,
} from '$lib/server/auth/guards';
import { can, rolesIn } from '$lib/domain/permissions';
import { prisma } from '$lib/server/db';
import { generateSchedule } from '$lib/server/services/interviewScheduler';
import {
  loadStageOr404 as loadStageEventOr404,
  stageEndOrDefault,
} from '$lib/server/services/stageContext';
import {
  applyPhaseOverride,
  getEventStatus,
  getLifecycleBounds,
  type LifecycleBounds,
} from '$lib/domain/eventLifecycle';
import { INTERVIEW_SLOT_MINUTES } from '$lib/domain/interview';
import {
  backgroundReconcile,
  clearEmailSyncCache,
  loadCalendarSyncState,
  reconcileForStaff,
  isSyncEnabled,
} from '$lib/server/services/calendarSync';

const MS_PER_DAY = 86_400_000;

const loadStageOr404 = (eventId: string, campusId: string) =>
  loadStageEventOr404(
    eventId,
    campusId,
    'Les entretiens sont réservés aux stages de seconde.',
  );

type LoadedEvent = Awaited<ReturnType<typeof loadStageOr404>>;

type InterviewerRow = {
  id: string;
  name: string;
  image: string | null;
  role: StaffRole;
  count: number;
};

type InterviewWithRelations = Interview & {
  talent: Talent;
  staff: {
    id: string;
    user: { name: string | null; image: string | null } | null;
  };
};

export const load: PageServerLoad = async ({ params, locals, url }) => {
  requireFlag(locals, 'stage_seconde');
  const campusId = getCampusId(locals);
  const event = await loadStageOr404(params.id, campusId);
  const db = scopedPrisma(campusId);
  const timezone = getCampusTimezone(locals);
  const bounds = getLifecycleBounds(timezone);

  const role = locals.staffProfile?.staffRole;
  // Non-dev interviewers (peda, manta) see only their own assignments and
  // always land on the operational view, regardless of stage phase.
  const isInterviewerOnly =
    !can('devMember', role) && can('interviewers', role);
  const realStatus = getEventStatus(event, bounds);
  const status = isInterviewerOnly
    ? 'ongoing'
    : applyPhaseOverride(realStatus, locals.stagePhaseOverride);

  const ctx: LoaderCtx = {
    db,
    event,
    bounds,
    timezone,
    scope: isInterviewerOnly ? 'self' : 'all',
    selfStaffId: locals.staffProfile?.id ?? null,
  };

  if (status === 'upcoming') {
    return {
      kind: 'prep' as const,
      scope: ctx.scope,
      event,
      timezone,
      bounds: serializeBounds(bounds),
      ...(await loadInterviewsPrep(ctx)),
    };
  }

  if (status === 'past') {
    return {
      kind: 'past' as const,
      scope: ctx.scope,
      event,
      timezone,
      bounds: serializeBounds(bounds),
      ...(await loadInterviewsPast(ctx)),
    };
  }

  // Calendar sync state is only consumed by the Ongoing view (the sync
  // button lives in its header). Loading it for prep/past would burn an
  // aggregate query + a user/account fetch for nothing.
  const calendarSync = await loadCalendarSyncOrNull(locals, event.id, timezone);

  return {
    kind: 'ongoing' as const,
    scope: ctx.scope,
    event,
    timezone,
    bounds: serializeBounds(bounds),
    calendarSync,
    ...(await loadInterviewsOngoing(ctx, url)),
  };
};

/**
 * Returns the calendar sync state for the current actor on this event, or
 * `null` if sync should be hidden entirely (feature disabled, impersonated
 * session, missing profile, or actor outside the `interviewers` group).
 *
 * Centralised so the load function reads as a single ternary on the result
 * rather than a five-line guard chain inline.
 */
async function loadCalendarSyncOrNull(
  locals: App.Locals,
  eventId: string,
  timezone: string,
) {
  if (!isSyncEnabled()) return null;
  if (locals.session?.impersonatedBy) return null;
  const userId = locals.user?.id;
  const staffProfileId = locals.staffProfile?.id;
  if (!userId || !staffProfileId) return null;
  if (!can('interviewers', locals.staffProfile?.staffRole)) return null;
  return loadCalendarSyncState({ userId, staffProfileId, eventId, timezone });
}

/**
 * Fire-and-forget calendar reconcile triggered after schedule-affecting
 * actions. Pass every staff profile whose assignments on this event just
 * changed — the façade resolves each to its owning user and reconciles
 * their calendar. Email backend lands invites in every affected mailbox
 * (organizer = Jump, recipient = the staff); Graph backend writes for
 * any staff that has a stored token, no-ops the rest.
 */
function reconcileAffected(
  eventId: string,
  staffProfileIds: readonly string[],
  timezone: string,
): void {
  backgroundReconcile({ eventId, staffProfileIds, timezone });
}

type LoaderCtx = {
  db: ScopedPrismaClient;
  event: LoadedEvent;
  bounds: LifecycleBounds;
  timezone: string;
  scope: 'all' | 'self';
  selfStaffId: string | null;
};

function serializeBounds(b: LifecycleBounds) {
  return {
    now: b.now.toISOString(),
    startOfDay: b.startOfDay.toISOString(),
    endOfDay: b.endOfDay.toISOString(),
  };
}

async function loadInterviewers(
  db: ScopedPrismaClient,
  eventId: string,
): Promise<InterviewerRow[]> {
  const staff = await db.staffProfile.findMany({
    where: { staffRole: { in: [...rolesIn('interviewers')] } },
    include: { user: true },
    orderBy: [{ user: { name: 'asc' } }],
  });

  const counts = await db.interview.groupBy({
    by: ['staffId'],
    where: { participation: { eventId } },
    _count: { _all: true },
  });
  const countById = new Map(counts.map((c) => [c.staffId, c._count._all]));

  return staff.map((s) => ({
    id: s.id,
    name: s.user?.name ?? 'Inconnu',
    image: s.user?.image ?? null,
    role: s.staffRole as StaffRole,
    count: countById.get(s.id) ?? 0,
  }));
}

async function loadInterviewsPrep(ctx: LoaderCtx) {
  const { db, event, bounds } = ctx;

  const [participationsTotal, participationsToCall, interviewers] =
    await Promise.all([
      db.participation.count({ where: { eventId: event.id } }),
      db.participation.findMany({
        where: { eventId: event.id, interview: null },
        include: { talent: true },
        orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
      }),
      loadInterviewers(db, event.id),
    ]);

  const interviewsScheduled = interviewers.reduce((sum, i) => sum + i.count, 0);
  const daysToStart = Math.max(
    0,
    Math.ceil((event.date.getTime() - bounds.now.getTime()) / MS_PER_DAY),
  );

  return {
    kpis: {
      participationsTotal,
      interviewsScheduled,
      interviewersCount: interviewers.length,
      unassigned: participationsToCall.length,
    },
    interviewers,
    participationsToCall,
    devs: interviewers.map((i) => ({ id: i.id, name: i.name, role: i.role })),
    daysToStart,
  };
}

async function loadInterviewsOngoing(ctx: LoaderCtx, url: URL) {
  const { db, event, bounds, scope, selfStaffId } = ctx;

  const where: Prisma.InterviewWhereInput = {
    participation: { eventId: event.id },
    ...(scope === 'self' && selfStaffId ? { staffId: selfStaffId } : {}),
  };

  const [interviews, participationsToCall, interviewers] = await Promise.all([
    db.interview.findMany({
      where,
      include: {
        talent: true,
        staff: { include: { user: true } },
      },
      orderBy: { date: 'asc' },
    }),
    scope === 'self'
      ? Promise.resolve([])
      : db.participation.findMany({
          where: { eventId: event.id, interview: null },
          include: { talent: true },
          orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
        }),
    loadInterviewers(db, event.id),
  ]);

  const todoCount = participationsToCall.length;
  const plannedCount = interviews.filter(
    (i) =>
      i.status === 'planned' && i.date.getTime() >= bounds.startOfDay.getTime(),
  ).length;
  const overdueCount = interviews.filter(
    (i) =>
      i.status === 'planned' && i.date.getTime() < bounds.startOfDay.getTime(),
  ).length;
  const completedCount = interviews.filter(
    (i) => i.status === 'completed',
  ).length;

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

  // Allow the page to deep-link a filter chip via ?status=todo|planned|done
  const initialFilter = parseFilter(url.searchParams.get('status'));

  return {
    interviews,
    participationsToCall,
    interviewers,
    devs: interviewers.map((i) => ({ id: i.id, name: i.name, role: i.role })),
    kpis: {
      todo: todoCount,
      planned: plannedCount,
      overdue: overdueCount,
      completed: completedCount,
    },
    dayN,
    totalDays,
    initialFilter,
  };
}

function parseFilter(raw: string | null): 'all' | 'todo' | 'planned' | 'done' {
  if (raw === 'todo' || raw === 'planned' || raw === 'done') return raw;
  return 'all';
}

async function loadInterviewsPast(ctx: LoaderCtx) {
  const { db, event, scope, selfStaffId } = ctx;

  const where: Prisma.InterviewWhereInput = {
    participation: { eventId: event.id },
    ...(scope === 'self' && selfStaffId ? { staffId: selfStaffId } : {}),
  };

  const [interviews, noInterviewParticipations, interviewers] =
    await Promise.all([
      db.interview.findMany({
        where,
        include: {
          talent: true,
          staff: { include: { user: true } },
        },
        orderBy: { date: 'asc' },
      }),
      scope === 'self'
        ? Promise.resolve([])
        : db.participation.findMany({
            where: { eventId: event.id, interview: null },
            include: { talent: true },
            orderBy: [
              { talent: { nom: 'asc' } },
              { talent: { prenom: 'asc' } },
            ],
          }),
      loadInterviewers(db, event.id),
    ]);

  const done = interviews.filter((i) => i.status === 'completed').length;
  const cancelled = interviews.filter((i) => i.status === 'cancelled').length;
  const stageEnd = stageEndOrDefault(event);
  const missed = interviews.filter(
    (i) => i.status === 'planned' && i.date.getTime() < stageEnd.getTime(),
  ).length;

  const recoDistribution: Record<InterviewRecommendation | 'unset', number> = {
    epitech_orientation_forte: 0,
    a_explorer: 0,
    autre_filiere: 0,
    a_determiner: 0,
    unset: 0,
  };
  for (const iv of interviews) {
    if (iv.status !== 'completed') continue;
    if (iv.recommendation) recoDistribution[iv.recommendation] += 1;
    else recoDistribution.unset += 1;
  }

  let dominantReco: InterviewRecommendation | null = null;
  let dominantCount = 0;
  for (const [reco, count] of Object.entries(recoDistribution)) {
    if (reco === 'unset') continue;
    if (count > dominantCount) {
      dominantCount = count;
      dominantReco = reco as InterviewRecommendation;
    }
  }

  return {
    interviews,
    noInterviewParticipations,
    interviewers,
    kpis: {
      done,
      cancelled,
      missed,
      noInterview: noInterviewParticipations.length,
      dominantReco,
    },
    recoDistribution,
  };
}

// ─── Actions ──────────────────────────────────────────────────────────────

export const actions: Actions = {
  schedule: async ({ params, request, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(scheduleInterviewSchema));
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    const timezone = getCampusTimezone(locals);
    const event = await loadStageOr404(params.id, campusId);

    const participation = await prisma.participation.findUnique({
      where: { id: form.data.participationId },
      select: { id: true, eventId: true, campusId: true, talentId: true },
    });
    if (
      !participation ||
      participation.eventId !== event.id ||
      participation.campusId !== campusId
    ) {
      return fail(400, { form });
    }

    const [year, month, day] = form.data.date.split('-').map(Number);
    const [hour, minute] = form.data.time.split(':').map(Number);
    const cdt = new CalendarDateTime(year, month, day, hour, minute);

    try {
      const db = scopedPrisma(campusId);
      await db.interview.create({
        data: {
          talentId: participation.talentId,
          participationId: participation.id,
          campusId,
          staffId: locals.staffProfile!.id,
          date: cdt.toDate(timezone),
          status: 'planned',
        },
      });
      // Actor scheduled themselves as the interviewer — they're the only
      // affected calendar.
      reconcileAffected(event.id, [locals.staffProfile!.id], timezone);
      return { form, success: true };
    } catch (err) {
      console.error('interview schedule failed', err);
      return fail(500, { form });
    }
  },

  updateStatus: async ({ params, request, locals }) => {
    const form = await superValidate(
      request,
      zod4(updateInterviewStatusSchema),
    );
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    const timezone = getCampusTimezone(locals);
    await loadStageOr404(params.id, campusId);

    // Authorisation mirrors `saveGrid`: dev team always; assigned staff
    // (peda / manta) on their own interviews. Without this, an assigned
    // peda could fill the grid but had to ask a dev to flip the status —
    // the "Menés" KPI would never increment until that handoff happened.
    const interview = await prisma.interview.findUnique({
      where: { id: form.data.id },
      select: { id: true, staffId: true, campusId: true },
    });
    if (!interview || interview.campusId !== campusId) {
      return fail(404, { form });
    }
    requireInterviewActor(locals, interview);

    try {
      const db = scopedPrisma(campusId);
      await db.interview.update({
        where: { id: form.data.id },
        data: { status: form.data.status },
      });
      // The assigned staff's calendar is the one to update — could be
      // someone other than the actor (e.g. dev marks a peda's interview
      // as cancelled).
      reconcileAffected(params.id, [interview.staffId], timezone);
      return { form, success: true };
    } catch (err) {
      console.error('interview updateStatus failed', err);
      return fail(500, { form });
    }
  },

  saveGrid: async ({ params, request, locals }) => {
    const form = await superValidate(request, zod4(interviewGridSchema));
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    const timezone = getCampusTimezone(locals);
    await loadStageOr404(params.id, campusId);

    const interview = await prisma.interview.findUnique({
      where: { id: form.data.id },
      select: { id: true, staffId: true, campusId: true },
    });
    if (!interview || interview.campusId !== campusId) {
      return fail(404, { form });
    }
    requireInterviewActor(locals, interview);

    const { id, recommendation, ...rest } = form.data;
    try {
      const db = scopedPrisma(campusId);
      await db.interview.update({
        where: { id },
        data: {
          ...rest,
          recommendation: recommendation ?? null,
        },
      });
      // Reflect the new globalNote / reco in the assigned staff's invite.
      reconcileAffected(params.id, [interview.staffId], timezone);
      return { form, success: true };
    } catch (err) {
      console.error('interview saveGrid failed', err);
      return fail(500, { form });
    }
  },

  autoSchedule: async ({ params, request, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(
      request,
      zod4(autoScheduleInterviewsSchema),
    );
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    const event = await loadStageOr404(params.id, campusId);
    const db = scopedPrisma(campusId);
    const timezone = getCampusTimezone(locals);

    const devs = await db.staffProfile.findMany({
      where: {
        id: { in: form.data.devIds },
        staffRole: { in: [...rolesIn('interviewers')] },
      },
      select: { id: true },
    });
    const validDevIds = devs.map((d) => d.id);
    if (validDevIds.length === 0) {
      return fail(400, {
        form,
        message: 'Aucun interviewer valide sélectionné.',
      });
    }

    const open = await db.participation.findMany({
      where: { eventId: event.id, interview: null },
      include: { talent: true },
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
    });

    let ordered = open.map((p) => ({
      id: p.id,
      talentId: p.talentId,
    }));
    if (form.data.participationOrder === 'random') {
      ordered = shuffle(ordered);
    }

    const participationToTalent = new Map(
      ordered.map((p) => [p.id, p.talentId]),
    );

    const result = generateSchedule({
      stageStart: event.date,
      stageEnd: stageEndOrDefault(event),
      devIds: validDevIds,
      interviewsPerDevPerDay: form.data.interviewsPerDevPerDay,
      slotDurationMinutes: form.data.slotDurationMinutes,
      dayStartHour: form.data.dayStartHour,
      dayEndHour: form.data.dayEndHour,
      lunchStartHour: form.data.lunchStartHour,
      lunchEndHour: form.data.lunchEndHour,
      participationIds: ordered.map((p) => p.id),
      timezone,
    });

    if (form.data.mode === 'preview') {
      return {
        form,
        preview: {
          slots: result.slots.map((s) => ({
            participationId: s.participationId,
            staffId: s.staffId,
            date: s.date.toISOString(),
          })),
          unscheduled: result.unscheduled,
          capacity: result.capacity,
        },
      };
    }

    try {
      const created = await db.interview.createMany({
        data: result.slots.map((s) => ({
          participationId: s.participationId,
          talentId: participationToTalent.get(s.participationId)!,
          staffId: s.staffId,
          campusId,
          date: s.date,
          status: 'planned',
        })),
        skipDuplicates: true,
      });
      // Every staff that just received assignments needs their calendar
      // updated. `validDevIds` is the dedup'd list of assignees, drives
      // one fan-out call per affected staff.
      reconcileAffected(event.id, validDevIds, timezone);
      return { form, created: created.count };
    } catch (err) {
      console.error('interview autoSchedule apply failed', err);
      return fail(500, { form });
    }
  },

  reassignInterview: async ({ params, request, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(reassignInterviewSchema));
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    await loadStageOr404(params.id, campusId);
    const db = scopedPrisma(campusId);
    const timezone = getCampusTimezone(locals);

    const [target, current] = await Promise.all([
      db.staffProfile.findUnique({
        where: { id: form.data.staffId },
        select: { id: true, staffRole: true, campusId: true },
      }),
      db.interview.findUnique({
        where: { id: form.data.interviewId },
        select: { id: true, date: true, staffId: true, campusId: true },
      }),
    ]);
    if (!current || current.campusId !== campusId) {
      return fail(404, { form, message: 'Entretien introuvable.' });
    }
    if (
      !target ||
      target.campusId !== campusId ||
      !rolesIn('interviewers').includes(target.staffRole as StaffRole)
    ) {
      return fail(400, { form, message: 'Interviewer invalide.' });
    }

    let newDate: Date | null = null;
    if (form.data.date && form.data.time) {
      const [year, month, day] = form.data.date.split('-').map(Number);
      const [hour, minute] = form.data.time.split(':').map(Number);
      newDate = new CalendarDateTime(year, month, day, hour, minute).toDate(
        timezone,
      );
    }
    const effectiveDate = newDate ?? current.date;

    // Conflict: existing planned interview for the target staff in the same
    // half-hour window. Skip the row we're reassigning.
    const windowMs = INTERVIEW_SLOT_MINUTES * 60_000;
    const conflict = await db.interview.findFirst({
      where: {
        id: { not: current.id },
        staffId: target.id,
        status: 'planned',
        date: {
          gte: new Date(effectiveDate.getTime() - windowMs + 1),
          lte: new Date(effectiveDate.getTime() + windowMs - 1),
        },
      },
      select: { id: true },
    });
    if (conflict) {
      return fail(409, {
        form,
        message: 'Conflit : créneau déjà occupé pour cet interviewer.',
      });
    }

    try {
      await db.interview.update({
        where: { id: current.id },
        data: {
          staffId: target.id,
          ...(newDate ? { date: newDate } : {}),
        },
      });
      // Reassign affects two calendars: the previous interviewer (who
      // should see the event removed / get a CANCEL invite) and the new
      // one (who should see it added / get a REQUEST invite). Skip the
      // dedupe in case of self-reassignment — the helper handles empty
      // and same-id lists fine.
      const affected =
        current.staffId === target.id
          ? [target.id]
          : [current.staffId, target.id];
      reconcileAffected(params.id, affected, timezone);
      return { form, success: true };
    } catch (err) {
      console.error('interview reassign failed', err);
      return fail(500, { form });
    }
  },

  /**
   * Bypass the contentHash dedupe and re-emit every email-mode invite for
   * the actor's scope. Recovery affordance for cases where the sync row
   * exists but the recipient never actually received the invite — bounce
   * before the webhook caught it, recipient deleted the original from
   * their inbox, dev-redirect flipped after a misdirected batch, etc.
   *
   * Two scopes mirror the page:
   *   - devMember: reset all rows on the event, then fan out reconcile
   *     to every assigned staff (recovers a misdirected batch in one
   *     click).
   *   - peda / manta (scope=self): reset only their own rows, reconcile
   *     only themselves (the equivalent of "redonner moi mes invites").
   */
  forceResync: async ({ params, locals }) => {
    if (!locals.user?.id || !locals.staffProfile?.id) {
      return fail(403, { message: 'Profil staff requis.' });
    }
    if (locals.session?.impersonatedBy) {
      return fail(403, {
        message: 'La synchronisation est désactivée en mode impersonation.',
      });
    }
    const role = locals.staffProfile.staffRole;
    if (!can('interviewers', role)) {
      return fail(403, { message: 'Réservé aux interviewers.' });
    }
    if (!isSyncEnabled()) {
      return fail(409, { message: 'Synchronisation désactivée.' });
    }

    const campusId = getCampusId(locals);
    const timezone = getCampusTimezone(locals);
    const event = await loadStageOr404(params.id, campusId);

    if (can('devMember', role)) {
      await clearEmailSyncCache({ scope: 'event', eventId: event.id });
      // Resolve every staff currently assigned on this event, not just
      // those with an existing sync row — a fresh assignee with no row
      // also needs an invite, and the cache clear doesn't cover them.
      const assignees = await prisma.interview.findMany({
        where: { participation: { eventId: event.id } },
        select: { staffId: true },
        distinct: ['staffId'],
      });
      reconcileAffected(
        event.id,
        assignees.map((a) => a.staffId),
        timezone,
      );
      return {
        forceResync: { scope: 'event' as const, dispatched: assignees.length },
      };
    }

    await clearEmailSyncCache({
      scope: 'user',
      userId: locals.user.id,
      eventId: event.id,
    });
    const result = await reconcileForStaff({
      staffProfileId: locals.staffProfile.id,
      userId: locals.user.id,
      eventId: event.id,
      timezone,
    });
    if ('error' in result) {
      const errorMessages: Record<typeof result.error, string> = {
        needs_reauth:
          'Veuillez reconnecter votre compte Microsoft pour autoriser la synchronisation.',
        no_email: "Aucune adresse email n'est associée à votre compte staff.",
        disabled: 'Synchronisation désactivée.',
      };
      return fail(409, {
        message: errorMessages[result.error],
        needsReauth: result.error === 'needs_reauth',
      });
    }
    return { forceResync: { scope: 'self' as const, sync: result } };
  },

  syncCalendar: async ({ params, locals }) => {
    if (!locals.user?.id || !locals.staffProfile?.id) {
      return fail(403, { message: 'Profil staff requis.' });
    }
    if (locals.session?.impersonatedBy) {
      return fail(403, {
        message: 'La synchronisation est désactivée en mode impersonation.',
      });
    }
    const role = locals.staffProfile.staffRole;
    if (!can('interviewers', role)) {
      return fail(403, { message: 'Réservé aux interviewers.' });
    }
    if (!isSyncEnabled()) {
      return fail(409, { message: 'Synchronisation désactivée.' });
    }

    const campusId = getCampusId(locals);
    const timezone = getCampusTimezone(locals);
    await loadStageOr404(params.id, campusId);

    const result = await reconcileForStaff({
      staffProfileId: locals.staffProfile.id,
      userId: locals.user.id,
      eventId: params.id,
      timezone,
    });
    if ('error' in result) {
      const errorMessages: Record<typeof result.error, string> = {
        needs_reauth:
          'Veuillez reconnecter votre compte Microsoft pour autoriser la synchronisation.',
        no_email: "Aucune adresse email n'est associée à votre compte staff.",
        disabled: 'Synchronisation désactivée.',
      };
      return fail(409, {
        message: errorMessages[result.error],
        needsReauth: result.error === 'needs_reauth',
      });
    }
    return { sync: result };
  },
};

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Re-export types so view components can share the row shape.
export type { InterviewerRow, InterviewWithRelations };
