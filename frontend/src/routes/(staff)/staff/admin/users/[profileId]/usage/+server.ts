import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import {
  USAGE_FEATURES,
  USAGE_FEATURE_DEFS,
  USAGE_RAW_RETENTION_MONTHS,
  isUsageFeatureKey,
  usageRawCutoff,
} from '$lib/domain/usage';
import { recordUsage } from '$lib/server/usage/record';

/**
 * One member's recent activity, for the dialog on `/staff/admin/users`.
 *
 * Fetched on demand rather than shipped with the list: the roster is 138 rows
 * and each member can hold hundreds of usage rows inside the retention window,
 * so folding this into the page load would be the `include` mistake the load's
 * own comment warns about, several times over.
 *
 * Bounded by construction: the window is the retention window, and the row cap
 * is the one below. The dialog is a "what has this person been doing lately"
 * view, not an audit trail; the audit trail is `AdminApi_Call`, and it answers a
 * different question.
 *
 * Gated by the route guard, which already restricts `/staff/admin/**` to admins.
 */
const RECENT_USES_LIMIT = 40;
const SESSIONS_LIMIT = 20;

export const GET: RequestHandler = async ({ params, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_STAFF_ACTIVITY_OPEN, { locals });

  const since = usageRawCutoff();

  const profile = await prisma.staffProfile.findUnique({
    where: { id: params.profileId },
    select: { userId: true },
  });
  if (!profile) return json({ uses: [], sessions: [] });

  const [uses, sessions] = await Promise.all([
    prisma.usage_FeatureUse.findMany({
      where: { staffProfileId: params.profileId, occurredAt: { gte: since } },
      orderBy: { occurredAt: 'desc' },
      take: RECENT_USES_LIMIT,
      select: { feature: true, occurredAt: true, impersonated: true },
    }),
    // Real sessions only: an impersonated session is the admin's visit to this
    // member's space, not this member logging in, which is the same rule the
    // activity projections are stamped under.
    prisma.bauth_session.findMany({
      where: { userId: profile.userId, impersonatedBy: null },
      orderBy: { createdAt: 'desc' },
      take: SESSIONS_LIMIT,
      select: { createdAt: true },
    }),
  ]);

  return json({
    windowMonths: USAGE_RAW_RETENTION_MONTHS,
    uses: uses.map((use) => ({
      // The key is resolved to its French label here rather than in the
      // component, so the catalogue stays the only place that names a feature.
      libelle: isUsageFeatureKey(use.feature)
        ? USAGE_FEATURE_DEFS[use.feature].label
        : use.feature,
      at: use.occurredAt.toISOString(),
      impersonated: use.impersonated,
    })),
    sessions: sessions.map((s) => s.createdAt.toISOString()),
  });
};
