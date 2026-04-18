import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { CalendarDateTime } from '@internationalized/date';
import {
  interviewGridSchema,
  scheduleInterviewSchema,
  updateInterviewStatusSchema,
} from '$lib/validation/interviews';

export const load: PageServerLoad = async ({ locals }) => {
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);

  const interviews = await db.interview.findMany({
    include: {
      talent: true,
      staff: { include: { user: true } },
    },
    orderBy: { date: 'asc' },
  });

  const talentsToCall = await db.talent.findMany({
    where: {
      eventsCount: { gt: 0 },
      interviews: { none: { campusId } },
    },
    orderBy: { xp: 'desc' },
    take: 15,
  });

  return { interviews, talentsToCall, timezone: getCampusTimezone(locals) };
};

export const actions: Actions = {
  schedule: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(scheduleInterviewSchema));
    if (!form.valid) return fail(400, { form });

    const [year, month, day] = form.data.date.split('-').map(Number);
    const [hour, minute] = form.data.time.split(':').map(Number);
    const cdt = new CalendarDateTime(year, month, day, hour, minute);

    try {
      const db = scopedPrisma(getCampusId(locals));
      await db.interview.create({
        data: {
          talentId: form.data.talentId,
          campusId: getCampusId(locals),
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

  updateStatus: async ({ request, locals }) => {
    const form = await superValidate(
      request,
      zod4(updateInterviewStatusSchema),
    );
    if (!form.valid) return fail(400, { form });

    try {
      const db = scopedPrisma(getCampusId(locals));
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

  saveGrid: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(interviewGridSchema));
    if (!form.valid) return fail(400, { form });

    const { id, ...grid } = form.data;

    try {
      const db = scopedPrisma(getCampusId(locals));
      await db.interview.update({
        where: { id },
        data: grid,
      });
      return { form, success: true };
    } catch (err) {
      console.error('interview saveGrid failed', err);
      return fail(500, { form });
    }
  },
};
