import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { USAGE_FEATURES } from '$lib/domain/usage';
import { getMemberActivity } from '$lib/server/usage/memberActivity';
import { recordUsage } from '$lib/server/usage/record';

/**
 * One member's recent activity, for the dialog on `/staff/admin/users`.
 *
 * Fetched on demand rather than shipped with the list: the roster is 138 rows
 * and each member can hold hundreds of usage rows inside the retention window,
 * so folding this into the page load would be the `include` mistake the load's
 * own comment warns about, several times over.
 *
 * Everything it means lives in `usage/memberActivity.ts`, including why the
 * connections do not come from `bauth_session` and why this stays out of the
 * operation catalogue. Gated by the route guard, which already restricts
 * `/staff/admin/**` to admins.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_STAFF_ACTIVITY_OPEN, { locals });

  const activity = await getMemberActivity(params.profileId);

  return json({
    ...activity,
    uses: activity.uses.map((use) => ({ ...use, at: use.at.toISOString() })),
    sessions: activity.sessions.map((session) => ({
      ...session,
      at: session.at.toISOString(),
    })),
  });
};
