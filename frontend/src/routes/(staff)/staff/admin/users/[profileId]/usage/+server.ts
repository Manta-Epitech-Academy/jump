import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { USAGE_FEATURES } from '$lib/domain/usage';
import { getMemberActivity } from '$lib/server/usage/memberActivity';
import { recordUsage } from '$lib/server/usage/record';

/**
 * One member's activity, for the dialog on `/staff/admin/users`.
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
  // An unknown profile is a 404 and not a 500. It used to be the latter, which
  // the dialog renders as « Chargement impossible » - the same thing it shows
  // for a database that is down, so a stale link and an outage looked alike.
  if (!activity) error(404, 'Membre introuvable');

  return json({
    ...activity,
    features: activity.features.map((feature) => ({
      ...feature,
      dernierUsage: feature.dernierUsage.toISOString(),
    })),
  });
};
