import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { CalendarDateTime } from '@internationalized/date';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import {
  autoScheduleInterviewsSchema,
  interviewGridSchema,
  scheduleInterviewSchema,
  updateInterviewStatusSchema,
} from '$lib/validation/interviews';
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';
import { rolesIn } from '$lib/domain/permissions';
import { prisma } from '$lib/server/db';
import { generateSchedule } from '$lib/server/services/interviewScheduler';
import {
  loadStageOr404 as loadStageEventOr404,
  stageEndOrDefault,
} from '$lib/server/services/stageContext';

const loadStageOr404 = (eventId: string, campusId: string) =>
  loadStageEventOr404(
    eventId,
    campusId,
    'Les entretiens sont réservés aux stages de seconde.',
  );

export const load: PageServerLoad = async ({ params, locals }) => {
  requireFlag(locals, 'stage_seconde');
  const campusId = getCampusId(locals);
  const event = await loadStageOr404(params.id, campusId);
  const db = scopedPrisma(campusId);

  const interviews = await db.interview.findMany({
    where: { participation: { eventId: event.id } },
    include: {
      talent: true,
      staff: { include: { user: true } },
    },
    orderBy: { date: 'asc' },
  });

  const participationsToCall = await db.participation.findMany({
    where: { eventId: event.id, interview: null },
    include: { talent: true },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const devs = await db.staffProfile.findMany({
    where: { staffRole: { in: [...rolesIn('devMember')] } },
    include: { user: true },
    orderBy: [{ user: { name: 'asc' } }],
  });

  return {
    event,
    interviews,
    participationsToCall,
    devs: devs.map((d) => ({ id: d.id, name: d.user?.name ?? 'Inconnu' })),
    timezone: getCampusTimezone(locals),
  };
};

export const actions: Actions = {
  schedule: async ({ params, request, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(scheduleInterviewSchema));
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
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
          date: cdt.toDate(getCampusTimezone(locals)),
          status: 'planned',
        },
      });
      return { form, success: true };
    } catch (err) {
      console.error('interview schedule failed', err);
      return fail(500, { form });
    }
  },

  updateStatus: async ({ params, request, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(
      request,
      zod4(updateInterviewStatusSchema),
    );
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    await loadStageOr404(params.id, campusId);

    try {
      const db = scopedPrisma(campusId);
      await db.interview.update({
        where: { id: form.data.id },
        data: { status: form.data.status },
      });
      return { form, success: true };
    } catch (err) {
      console.error('interview updateStatus failed', err);
      return fail(500, { form });
    }
  },

  saveGrid: async ({ params, request, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(interviewGridSchema));
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    await loadStageOr404(params.id, campusId);

    const { id, ...grid } = form.data;
    try {
      const db = scopedPrisma(campusId);
      await db.interview.update({ where: { id }, data: grid });
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
        staffRole: { in: [...rolesIn('devMember')] },
      },
      select: { id: true },
    });
    const validDevIds = devs.map((d) => d.id);
    if (validDevIds.length === 0) {
      return fail(400, { form, message: 'Aucun dev valide sélectionné.' });
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
      return { form, created: created.count };
    } catch (err) {
      console.error('interview autoSchedule apply failed', err);
      return fail(500, { form });
    }
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
