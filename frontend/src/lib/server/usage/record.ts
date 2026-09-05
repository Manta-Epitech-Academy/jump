import { prisma } from '$lib/server/db';
import {
  USAGE_FEATURE_DEFS,
  usageDedupeKey,
  type UsageFeatureKey,
} from '$lib/domain/usage';
import { actorHash } from './actorHash';

/**
 * Record one use of one catalogued feature.
 *
 * NEVER AWAITED, NEVER THROWS. A `void` return, an un-awaited write and a
 * swallowed rejection, copying `markRecipientOpened`
 * (`services/broadcast/tracking.ts`) and the talent activity stamp in
 * `hooks.server.ts`. This is deliberately unlike `recordAdminApiCall`, which
 * awaits inside a try/catch because "the log is the control": a usage row
 * authorises nothing and holds nobody accountable, so losing one degrades a
 * percentage, while blocking an export on one would be an outage.
 *
 * SERVER ONLY, and never reachable from client code. Instructing a browser to
 * post a result back is an access to the terminal under art. 5(3) ePD (EDPB
 * Guidelines 2/2023), which would drag the whole thing into art. 82 consent.
 * There is no `/api/usage` endpoint and there must not be one. `usage.test.ts`
 * fails if this module is imported outside `$lib/server`.
 *
 * WHAT IT REFUSES TO RECORD, each for its own reason:
 *   - a talent who has objected (`usageAnalyticsOptOutAt`), art. 21;
 *   - anything at all while an admin impersonates a talent, exactly as the
 *     `lastActiveAt` stamp already skips: the request is an admin testing the
 *     talent's experience, not the talent being active. The admin's own
 *     exploration is already recorded as `admin_explore_campus` /
 *     `admin_impersonate_person`;
 *   - a pseudonymous use when `USAGE_SALT` is unset (see `actorHash`);
 *   - a use whose actor cannot be resolved at all.
 *
 * An admin impersonating a STAFF member is recorded, against the real admin,
 * with `impersonated: true`, so an admin checking a campus never inflates that
 * campus's adoption.
 */
export interface UsageContext {
  locals: App.Locals;
  /** Required by an `event`-scope feature; ignored by the others. */
  eventId?: string | null;
  /**
   * The `bauth_session` id, for a `session` feature. Passing it is what makes
   * the row exactly-once per real login: it becomes the dedupe key, so no slice
   * arithmetic is involved and a re-login is a new row.
   */
  sessionId?: string | null;
}

type Resolved = {
  actorKind: 'talent' | 'staff';
  staffProfileId: string | null;
  actorHash: string | null;
  campusId: string | null;
  impersonated: boolean;
  /** Stable within a month, and what `dedupeKey` is built from. */
  actorRef: string;
};

function resolveActor(
  key: UsageFeatureKey,
  { locals }: UsageContext,
  now: Date,
): Resolved | null {
  const featureDef = USAGE_FEATURE_DEFS[key];
  const impersonatedById =
    (locals.session as { impersonatedBy?: string | null } | null)
      ?.impersonatedBy ?? null;

  if (featureDef.audience === 'staff') {
    // Under impersonation the acting human is the admin behind the session, so
    // the row is theirs. `locals.impersonator` already carries their profile.
    const staffProfileId = impersonatedById
      ? locals.impersonator?.staffProfileId
      : locals.staffProfile?.id;
    if (!staffProfileId) return null;
    const campusId = impersonatedById
      ? null
      : (locals.staffProfile?.campusId ?? null);
    return {
      actorKind: 'staff',
      staffProfileId,
      actorHash: null,
      campusId,
      impersonated: Boolean(impersonatedById),
      actorRef: staffProfileId,
    };
  }

  // Talent. An impersonated request is the admin's, not theirs, so nothing is
  // recorded at all rather than being attributed to either of them.
  if (impersonatedById) return null;
  const talent = locals.talent;
  if (!talent || talent.usageAnalyticsOptOutAt) return null;
  const campusId = locals.talentCampusId ?? null;
  const hash = actorHash(talent.id, campusId, now);
  if (!hash) return null;
  return {
    actorKind: 'talent',
    staffProfileId: null,
    actorHash: hash,
    campusId,
    impersonated: false,
    actorRef: hash,
  };
}

export function recordUsage(key: UsageFeatureKey, ctx: UsageContext): void {
  const now = new Date();
  const featureDef = USAGE_FEATURE_DEFS[key];
  const actor = resolveActor(key, ctx, now);
  if (!actor) return;

  prisma.usage_FeatureUse
    .createMany({
      data: [
        {
          feature: key,
          actorKind: actor.actorKind,
          staffProfileId: actor.staffProfileId,
          actorHash: actor.actorHash,
          // `scope` decides which columns are populated, so a `global` feature
          // carries neither: the admin space is national, and stamping a campus
          // there would invite a per-campus reading of it that the data does
          // not support.
          campusId: featureDef.scope === 'global' ? null : actor.campusId,
          eventId: featureDef.scope === 'event' ? (ctx.eventId ?? null) : null,
          impersonated: actor.impersonated,
          // Composed in the domain, so the seed generator writes the same
          // key rather than a lookalike. See `usageDedupeKey`.
          dedupeKey: usageDedupeKey({
            feature: key,
            actorRef: actor.actorRef,
            sessionId: ctx.sessionId,
            eventId: ctx.eventId,
            impersonated: actor.impersonated,
            at: now,
          }),
          occurredAt: now,
        },
      ],
      // The whole deduplication mechanism, in one statement: no prior read, no
      // race between pods, and the same shape as `XpGrant`'s unique key.
      skipDuplicates: true,
    })
    .catch(() => {});
}
