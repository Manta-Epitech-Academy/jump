/**
 * The operational tail: what shows up in the admin queues, the audit trail and
 * the usage figures.
 *
 * None of this is glamorous and all of it is load-bearing. These are the rows
 * that make an empty queue distinguishable from a broken one, and they are where
 * most of the remaining enum values live - which is why the coverage check finds
 * them here rather than in a scenario about talents.
 */

import type { StaffRole, TalentDeletionRequestStatus } from '@prisma/client';
import type { World, TalentRef, StaffRef, CampusRef, EventRef } from '../world';
import { id, seq } from '../ids';
import { withGuaranteed } from '../rng';
import {
  USAGE_FEATURES,
  USAGE_FEATURE_DEFS,
  USAGE_FEATURE_KEYS,
  USAGE_RAW_RETENTION_MONTHS,
} from '../../../src/lib/domain/usage';

/**
 * Unresolved sync errors.
 *
 * Production carries 142, all of one type, 106 still open, and one of them has
 * recurred 11357 times. That last number is the point: a queue screen that
 * renders an occurrence count has to survive a five-digit one, and a triage
 * screen has to make the difference between a one-off and something that has
 * been failing on every sync for months.
 */
export function addSyncErrors(
  world: World,
  talents: readonly TalentRef[],
): void {
  const clock = world.ctx.clock;
  for (const [index, talent] of talents.entries()) {
    const resolved = index % 4 === 0;
    // An error the rebind can act on names the fiche it collided with; one
    // raised before any fiche was resolved does not, and `syncErrorService`'s
    // refusal branch is reachable only through the second. A queue where every
    // row carries an existing extId can never show that refusal.
    const collided = index % 3 !== 0;
    world.buffer.syncError.push({
      id: id('sye', seq(index, 3)),
      errorType: 'DUPLICATE_EMAIL',
      email: talent.email,
      attemptedExtId: `sf_dup_${seq(index, 6)}`,
      existingExtId: collided ? `sf_${seq(index, 6)}` : null,
      // Set on an error raised while syncing a campaign rather than a contact.
      eventExtId: index % 5 === 0 ? `sfc_${seq(index, 6)}` : null,
      talentName: `${talent.prenom} ${talent.nom}`,
      message: 'Une autre fiche porte déjà cette adresse email.',
      resolved,
      resolvedAt: resolved ? clock.days(-9) : null,
      occurrenceCount: index === 0 ? 11357 : 1 + index * 3,
      lastOccurredAt: clock.days(-1),
      createdAt: clock.days(-120),
    });
  }
}

/** An RGPD erasure request in each state the workflow can be in. */
export function addDeletionRequests(
  world: World,
  talents: readonly TalentRef[],
  staffUserId: string,
): void {
  const states: TalentDeletionRequestStatus[] = [
    'pending',
    'fulfilled',
    'rejected',
    'cancelled',
  ];
  for (const [index, status] of states.entries()) {
    const talent = talents[index];
    if (!talent) break;
    const settled = status !== 'pending';
    world.buffer.talentDeletionRequest.push({
      id: id('tdr', status),
      talentId: talent.id,
      status,
      // A request filed with no stated reason is the ordinary case on a form
      // whose reason box is optional, and « aucun motif indiqué » is a
      // rendering the queue has to have an example of.
      reason: index === 0 ? null : 'Demande du responsable légal.',
      requestedAt: world.ctx.clock.days(-40 + index),
      // Acknowledged, but not yet acted on: the state between « reçue » and
      // « traitée ». The pending one is deliberately NOT acknowledged, because
      // « reçue, pas encore accusée » is the row the queue exists to surface.
      acknowledgedAt: settled ? world.ctx.clock.days(-35 + index) : null,
      // A bare string with no foreign key, on purpose: the audit of who
      // resolved an erasure has to outlive that person's own account.
      resolvedBy: settled ? staffUserId : null,
      resolvedAt: settled ? world.ctx.clock.days(-30 + index) : null,
      resolutionNote:
        status === 'rejected'
          ? 'Talent encore inscrit à un événement à venir.'
          : null,
    });
  }
}

/**
 * A reset closing.
 *
 * The reset event is the trace: the record it describes is gone, and this row is
 * the only thing that says it ever existed. Seeding one keeps the admin archive
 * honest about what a reset looks like after the fact.
 */
export function addClosingReset(
  world: World,
  talents: readonly TalentRef[],
  staff: StaffRef,
): void {
  const clock = world.ctx.clock;
  // Two traces, and the pair is the point. Both staff keys are `SetNull`, so
  // either end can name somebody who has since left, and the trace has to keep
  // saying a closing was destroyed after either of them is gone. One row can
  // only ever show one of the two states.
  const shapes = [
    { key: 'complet', conductedBy: staff.id, resetBy: staff.id },
    { key: 'conducteur-parti', conductedBy: null, resetBy: staff.id },
    { key: 'effaceur-parti', conductedBy: staff.id, resetBy: null },
  ];
  for (const [index, shape] of shapes.entries()) {
    const talent = talents[index];
    if (!talent) break;
    world.buffer.closing_ResetEvent.push({
      id: id('cre', talent.id.replace(/^sd_/, ''), shape.key),
      talentId: talent.id,
      conductedByStaffId: shape.conductedBy,
      conductedAt: clock.days(-45 - index),
      resetByStaffId: shape.resetBy,
      reason: 'Grille conduite sur le mauvais événement.',
      createdAt: clock.days(-44 - index),
    });
  }
}

/** An identity repair, the trace the auth-conflict tool leaves behind. */
export function addIdentityRepair(
  world: World,
  talent: TalentRef,
  staff: StaffRef,
): void {
  const clock = world.ctx.clock;
  // A relink moves an existing account onto the right identity, so it names
  // both ends. A merge collapses a duplicate, so it names the account that
  // disappeared and no address to move to. Seeding only the first left
  // `fromUserId` null on every row and both address columns always set, which
  // is the shape the merge branch of the tool does NOT produce.
  world.buffer.authIdentityRepair.push({
    id: id('air', talent.id.replace(/^sd_/, ''), 'relink'),
    talentId: talent.id,
    kind: 'relink',
    toUserId: talent.userId,
    fromEmail: `ancienne.${talent.email}`,
    toEmail: talent.email,
    // No foreign key on purpose upstream: an audit row must outlive the account
    // it names, so the resolver is a bare string.
    resolvedBy: staff.userId,
    resolvedAt: clock.days(-15),
  });
  world.buffer.authIdentityRepair.push({
    id: id('air', talent.id.replace(/^sd_/, ''), 'merge'),
    talentId: talent.id,
    kind: 'merge',
    fromUserId: `${talent.userId ?? id('usr', 'orphan')}_doublon`,
    toUserId: null,
    fromEmail: null,
    toEmail: null,
    resolvedBy: staff.userId,
    resolvedAt: clock.days(-14),
  });
}

/** Pending staff invitations, one per invitable role. */
export function addInvitations(
  world: World,
  campus: CampusRef,
  invitedBy: StaffRef,
): void {
  const roles: StaffRole[] = ['dev', 'superdev'];
  for (const [index, role] of roles.entries()) {
    world.buffer.staffInvitation.push({
      id: id('inv', role),
      email: `invite.${role}@epitech.eu`,
      // A superdev is invited to a campus; the national roles are not attached
      // to one, which is the state `campusId` is nullable for and the one the
      // invitation dialog renders as « tous les campus ».
      campusId: role === 'superdev' ? null : campus.id,
      staffRole: role,
      invitedByUserId: invitedBy.userId,
      createdAt: world.ctx.clock.days(-3 - index),
    });
  }
}

/**
 * Admin API tokens, one per tier, plus a revoked one.
 *
 * `tokenHash` is a hash, never a token: nothing here can authenticate. A
 * leadership token is read-only by construction, which the schema now holds as a
 * CHECK rather than as an `if`, so a write-enabled leadership row would be
 * refused by the database and not by this comment.
 */
export function addAdminApiTokens(world: World, staff: StaffRef): void {
  const clock = world.ctx.clock;
  const rows = [
    { key: 'core', tier: 'core' as const, writeEnabled: true, revoked: false },
    {
      key: 'leadership',
      tier: 'leadership' as const,
      writeEnabled: false,
      revoked: false,
    },
    {
      key: 'revoked',
      tier: 'core' as const,
      writeEnabled: false,
      revoked: true,
    },
  ];
  for (const row of rows) {
    const tokenId = id('apt', row.key);
    world.buffer.adminApi_Token.push({
      id: tokenId,
      staffUserId: staff.userId,
      label: `Jeton ${row.key}`,
      tier: row.tier,
      writeEnabled: row.writeEnabled,
      tokenHash: `seed-not-a-real-token-${row.key}`,
      createdAt: clock.days(-60),
      lastUsedAt: row.revoked ? null : clock.days(-1),
      revokedAt: row.revoked ? clock.days(-5) : null,
      revokedByUserId: row.revoked ? staff.userId : null,
    });
    world.buffer.adminApi_Call.push({
      id: id('apc', row.key),
      tokenId,
      // A bare string, no foreign key: the audit row must survive the account.
      actorUserId: staff.userId,
      operation: 'stats_cohort_profile',
      params: { schoolYear: clock.schoolYear },
      status: 200,
      createdAt: clock.days(-1),
    });
  }

  // A write, which is the only kind of call that has a before and an after. The
  // audit tier exists to answer « qu'est-ce qui a changé », and a log holding
  // reads alone answers it with three nulls on every row.
  world.buffer.adminApi_Call.push({
    id: id('apc', 'write'),
    tokenId: id('apt', 'core'),
    actorUserId: staff.userId,
    operation: 'write_event_inscrits_options',
    params: { eventId: 'sd_evt_exemple', cohortNoun: 'stagiaires' },
    before: { cohortNoun: null },
    after: { cohortNoun: 'stagiaires' },
    status: 200,
    createdAt: clock.days(-2),
  });

  // And a call whose token has since been deleted outright. `tokenId` is
  // nullable FOR this: revoking a token hides it, deleting one must not take
  // the record of what it did with it.
  world.buffer.adminApi_Call.push({
    id: id('apc', 'orphan'),
    tokenId: null,
    actorUserId: staff.userId,
    operation: 'stats_attendance',
    status: 403,
    createdAt: clock.days(-30),
  });
}

/**
 * How much of the catalogue is actually exercised.
 *
 * Not all of it, deliberately. `stats_feature_adoption_gaps` answers "what has
 * nobody touched", and a dataset where everything is used answers it with an
 * empty list, which is indistinguishable from a broken query. A dataset where
 * almost nothing is used answers it with the whole catalogue, which is the one
 * error `AGENTS.md` singles out as the one that makes somebody delete a feature
 * that is in use. Both were reachable: the generator named four keys of 106.
 *
 * So most of the catalogue is used and a real minority is not, and which
 * minority is decided by the draw rather than by a list here, so adding a
 * feature does not need this number touched.
 */
const FEATURE_ADOPTION_SHARE = 0.8;

/**
 * Usage rows, in both actor regimes, over the whole catalogue.
 *
 * Staff are identified because they are adults and employees; talents get a
 * monthly-rotating pseudonym and nothing else, which is why the talent metric is
 * monthly-active and never annual. There is no `path`, no `userAgent` and no
 * `talentId` here, and that absence is the privacy boundary rather than an
 * omission - the same reason the real recorder writes none of them.
 *
 * Every row's shape is taken from the catalogue's own definition rather than
 * decided here: `scope` says whether it carries a campus, an event or neither,
 * `dedupe` says whether it carries an idempotency key, and `audience` says which
 * actor regime writes it. That is the same rule as everywhere else in this
 * directory - the domain is imported, never restated - and it is what makes the
 * three columns the recorder composes (`campusId`, `eventId`, `dedupeKey`) carry
 * both of their branches without anybody enumerating which features are which.
 */
export function addUsage(
  world: World,
  opts: {
    staff: readonly StaffRef[];
    campuses: readonly CampusRef[];
    events: readonly EventRef[];
    talentCount: number;
  },
): void {
  const clock = world.ctx.clock;
  const rng = world.ctx.rng.fork('usage');
  const staff = opts.staff;
  if (staff.length === 0 || opts.campuses.length === 0) return;

  const adoptedSample = rng.sample(
    USAGE_FEATURE_KEYS,
    Math.round(USAGE_FEATURE_KEYS.length * FEATURE_ADOPTION_SHARE),
  );
  // Placed, not drawn: the matrix needs at least one cell it does NOT have to
  // mask, and a random sample of ~80% of the catalogue either lands on a
  // talent+campus-scoped feature or it does not. Guaranteeing this one is
  // adopted is what lets the campus it is placed on (below) clear the floor
  // deterministically, on every profile.
  const talentCampusFeature = USAGE_FEATURE_KEYS.find(
    (key) =>
      USAGE_FEATURE_DEFS[key].audience === 'talent' &&
      USAGE_FEATURE_DEFS[key].scope === 'campus',
  );
  const adopted = talentCampusFeature
    ? withGuaranteed(adoptedSample, talentCampusFeature)
    : adoptedSample;

  for (const [index, feature] of adopted.entries()) {
    const definition = USAGE_FEATURE_DEFS[feature];
    // Spread over months, because a distinct actor is counted PER MONTH: the
    // reported figure is the busiest month's, never a running total, and a
    // dataset sitting inside one month cannot tell the two apart.
    const monthsAgo = index % 5;

    if (definition.audience === 'staff') {
      // Not every member touches every feature: an adoption figure where the
      // whole team uses everything has no shape, and `ops_staff_activity` exists
      // to surface the member who uses nothing.
      const users = rng.sample(staff, rng.int(1, staff.length));
      for (const [userIndex, member] of users.entries()) {
        const event =
          definition.scope === 'event'
            ? (opts.events.find(
                (candidate) => candidate.campusId === member.campusId,
              ) ?? opts.events[0])
            : undefined;
        // Null for a `global`-scope feature, and that is a documented state
        // rather than a missing value: the admin space is national, so a
        // per-campus breakdown of it would invite a reading the data does not
        // support.
        const campusId = definition.scope === 'global' ? null : member.campusId;
        pushUse(world, {
          key: ['staff', seq(index, 3), seq(userIndex, 3)],
          feature,
          actorKind: 'staff',
          staffProfileId: member.id,
          campusId,
          eventId: event?.id ?? null,
          // Null for an `each` feature: two exports a minute apart are two
          // legitimate rows, and Postgres treats NULLs as distinct.
          dedupeKey:
            definition.dedupe === 'each'
              ? null
              : `${member.id}:${event?.id ?? campusId ?? 'global'}:${feature}`,
          occurredAt: clock.months(-monthsAgo, -userIndex - 1),
        });
      }
      continue;
    }

    // Enough distinct pseudonyms to sit above the five-actor floor, so the
    // matrix has at least one cell it does NOT have to mask. A dataset that only
    // produces masked cells cannot tell a working mask from a broken query.
    // Every feature but the guaranteed one spreads by real campus weight,
    // which is where most cells legitimately stay under the floor and stay
    // masked; the guaranteed one is placed entirely on the platform's
    // heaviest campus, so that specific cell clears it deterministically
    // instead of depending on how a weighted spread happens to land.
    for (let i = 0; i < opts.talentCount; i += 1) {
      const campus =
        feature === talentCampusFeature
          ? opts.campuses[0]!
          : world.pickWeightedCampus();
      pushUse(world, {
        key: ['talent', seq(index, 3), seq(i, 3)],
        feature,
        actorKind: 'talent',
        actorHash: `seedhash${seq(i, 4)}`,
        campusId: definition.scope === 'global' ? null : campus.id,
        eventId: null,
        dedupeKey:
          definition.dedupe === 'each'
            ? null
            : `seedhash${seq(i, 4)}:${feature}`,
        occurredAt: clock.months(-monthsAgo, -i - 1),
      });
    }
  }

  // An admin looking at a campus while impersonating one of its members. The
  // aggregates filter these out, so a dataset without one cannot tell a working
  // filter from a forgotten one - and the flag is inside `dedupeKey` precisely
  // so an impersonated use and a real one are two rows rather than one lost.
  const [admin] = staff;
  if (admin) {
    const feature = USAGE_FEATURES.DEV_INSCRITS_VIEW;
    const event = opts.events[0];
    pushUse(world, {
      key: ['impersonated'],
      feature,
      actorKind: 'staff',
      staffProfileId: admin.id,
      campusId: opts.campuses[0]!.id,
      eventId: event?.id ?? null,
      impersonated: true,
      dedupeKey: `${admin.id}:${event?.id ?? 'none'}:${feature}:impersonated`,
      occurredAt: clock.days(-2),
    });
  }
}

function pushUse(
  world: World,
  row: {
    key: string[];
    feature: string;
    actorKind: 'staff' | 'talent';
    staffProfileId?: string;
    actorHash?: string;
    campusId: string | null;
    eventId: string | null;
    dedupeKey: string | null;
    occurredAt: Date;
    impersonated?: boolean;
  },
): void {
  world.buffer.usage_FeatureUse.push({
    id: id('ufu', ...row.key),
    feature: row.feature,
    actorKind: row.actorKind,
    staffProfileId: row.staffProfileId,
    actorHash: row.actorHash,
    campusId: row.campusId,
    eventId: row.eventId,
    impersonated: row.impersonated ?? false,
    dedupeKey: row.dedupeKey,
    occurredAt: row.occurredAt,
  });
}

/**
 * The actor-free monthly cube, folded from the raw rows just written.
 *
 * It is the store that answers beyond `USAGE_RAW_RETENTION_MONTHS`, and it had
 * never held a row: every figure came from the raw table, so the store boundary
 * in `server/usage/read.ts` was never once crossed by anything a person could
 * look at. `AGENTS.md` says of that pair that "both halves shipped broken and
 * neither was visible to a test"; a dataset with an empty cube is how that
 * stays true.
 *
 * Folded from the raw rows rather than invented beside them, exactly as
 * `usage/rollup.ts` does, so the two stores cannot disagree about a month they
 * both cover. And the months OUTSIDE the retention window get a cube row with no
 * raw row behind it, which is the state a real rollup leaves once the purge has
 * run and the only one that exercises the boundary.
 */
export function foldUsageMonthly(world: World): void {
  const clock = world.ctx.clock;
  type Cell = { uses: number; actors: Set<string> };
  const cube = new Map<string, Cell>();

  for (const row of world.buffer.usage_FeatureUse) {
    if (row.impersonated) continue;
    const month = clock.monthKey(row.occurredAt as Date);
    const campusId = (row.campusId as string | null) ?? '';
    const key = `${row.feature as string} ${row.actorKind as string} ${campusId} ${month}`;
    const cell = cube.get(key) ?? { uses: 0, actors: new Set<string>() };
    cell.uses += 1;
    cell.actors.add(
      (row.staffProfileId as string | null) ??
        (row.actorHash as string | null) ??
        '',
    );
    cube.set(key, cell);
  }

  // One month past the retention window, with nothing left in the raw table:
  // the shape a rolled-up-then-purged month actually has.
  const archivedMonth = clock.monthKey(
    clock.months(-(USAGE_RAW_RETENTION_MONTHS + 1), 0),
  );
  cube.set(`${USAGE_FEATURES.DEV_INSCRITS_VIEW} staff  ${archivedMonth}`, {
    uses: 42,
    actors: new Set(['archived-1', 'archived-2', 'archived-3']),
  });

  for (const [key, cell] of cube) {
    const [feature, actorKind, campusId, month] = key.split(' ') as [
      string,
      'staff' | 'talent',
      string,
      string,
    ];
    world.buffer.usage_FeatureMonthly.push({
      id: id('ufm', feature, actorKind, campusId || 'global', month),
      feature,
      actorKind,
      campusId: campusId === '' ? null : campusId,
      month,
      uses: cell.uses,
      distinctActors: cell.actors.size,
      computedAt: clock.today,
    });
  }
}
