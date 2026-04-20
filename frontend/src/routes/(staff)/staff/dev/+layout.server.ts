import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import { EVENT_TYPES } from '$lib/domain/event';

const STAGE_DEFAULT_DURATION_DAYS = 14;

export const load: LayoutServerLoad = async ({ parent, locals }) => {
  const { user, staffProfile } = await parent();

  if (!user) {
    throw redirect(302, resolve('/staff/login'));
  }

  const role = staffProfile?.staffRole;
  if (role !== 'superdev' && role !== 'dev') {
    const target = getStaffRoleRedirectPath(role);
    throw redirect(302, resolve(target ?? '/staff/login'));
  }

  const db = scopedPrisma(getCampusId(locals));
  const now = new Date();
  const fallbackStart = new Date(now);
  fallbackStart.setDate(fallbackStart.getDate() - STAGE_DEFAULT_DURATION_DAYS);
  const stageCandidates = await db.event.findMany({
    where: {
      eventType: EVENT_TYPES.STAGE_SECONDE,
      date: { lte: now, gte: fallbackStart },
    },
    select: { id: true, titre: true, date: true, endDate: true },
    orderBy: { date: 'desc' },
  });
  const activeStage =
    stageCandidates.find((e) => {
      const end =
        e.endDate ??
        new Date(e.date.getTime() + STAGE_DEFAULT_DURATION_DAYS * 86_400_000);
      return end.getTime() >= now.getTime();
    }) ?? null;

  return {
    user,
    staffProfile,
    timezone: getCampusTimezone(locals),
    activeStage: activeStage
      ? { id: activeStage.id, titre: activeStage.titre }
      : null,
  };
};
