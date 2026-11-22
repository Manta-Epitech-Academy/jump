import { z } from 'zod';
import { USAGE_FEATURES } from '#lib/domain/usage.ts';
import { gatedQuery } from '#lib/server/remoteFunctions.ts';
import { getMemberActivity } from '#lib/server/usage/memberActivity.ts';
import { recordUsage } from '#lib/server/usage/record.ts';

/**
 * One member's activity, for `StaffActivityDialog` on `/staff/admin/users`.
 *
 * Asked when the dialog opens rather than shipped with the list: the roster is
 * 138 rows and each member can hold hundreds of usage rows inside the retention
 * window, so folding this into the page load would be the `include` mistake the
 * load's own comment warns about, several times over.
 *
 * Everything it means lives in `usage/memberActivity.ts`, including why the
 * connections do not come from `bauth_session` and why this stays out of the
 * operation catalogue. Null for a profile that no longer exists, which the
 * dialog tells apart from a failure: a stale row and an outage are different
 * answers to the admin.
 */
export const memberActivity = gatedQuery(
  { admin: true },
  z.string().min(1),
  (profileId, { locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_STAFF_ACTIVITY_OPEN, { locals });
    return getMemberActivity(profileId);
  },
);
