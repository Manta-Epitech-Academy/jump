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
import { COHORT_NOUNS } from '../../../src/lib/domain/event';
import {
  USAGE_FEATURES,
  USAGE_FEATURE_DEFS,
  USAGE_FEATURE_KEYS,
  USAGE_RAW_RETENTION_MONTHS,
  usageDedupeKey,
  type UsageFeatureKey,
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
  //
  // The operation and the field have to belong together, because an audit row
  // is read as the record of a call that was actually made: `cohortNoun` is a
  // field of `write_event_config`, and `write_event_inscrits_options` - which
  // this named - takes `showStatutColumn` and nothing else, so the row
  // described a call the catalogue would have refused. The noun is singular for
  // the same reason it is singular everywhere else: `cohortNounForms` builds
  // the plural and never the reverse.
  world.buffer.adminApi_Call.push({
    id: id('apc', 'write'),
    tokenId: id('apt', 'core'),
    actorUserId: staff.userId,
    operation: 'write_event_config',
    params: {
      eventId: 'sd_evt_exemple',
      cohortNoun: COHORT_NOUNS.STAGIAIRE,
    },
    before: { cohortNoun: null },
    after: { cohortNoun: COHORT_NOUNS.STAGIAIRE },
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

  // ── Staff: the rows follow the VISITS, never the catalogue ────────────────
  //
  // In production `hooks.server.ts` writes the view row and the session row on
  // the same request, from the same context, so a connection always coincides
  // with a real navigation and every day of feature use sits inside a live
  // session. This loop used to iterate the catalogue instead, drawing a random
  // subset of the team per feature and dating it from the feature's position:
  // the two session keys were two entries among 106, and their seeded dedupe
  // key carried no time slice at all, so a member could hold at most one row
  // per feature. Whatever the dataset said they had done, their connection
  // count was capped at two, on days unrelated to anything else they touched.
  const staffPool = adopted.filter(
    (key) =>
      USAGE_FEATURE_DEFS[key].audience === 'staff' &&
      USAGE_FEATURE_DEFS[key].kind !== 'connection',
  );
  // Sessions are out of the adoption draw on purpose. A session is not a
  // feature somebody adopts: it is written for everyone who comes, so leaving
  // it in would let the dice report « personne n'ouvre l'espace dev » about a
  // roster that visibly does.
  const sessionOf = {
    dev: USAGE_FEATURES.DEV_CONNECTION,
    admin: USAGE_FEATURES.ADMIN_CONNECTION,
  };

  for (const [memberIndex, member] of staff.entries()) {
    if (member.visits.length === 0) continue;
    // Not every member touches every feature: an adoption figure where the whole
    // team uses everything has no shape, and `ops_staff_activity` exists to
    // surface the member who uses nothing.
    const own = rng.sample(
      staffPool,
      rng.int(Math.ceil(staffPool.length / 4), staffPool.length),
    );
    const spaceOwn = {
      dev: own.filter((key) => USAGE_FEATURE_DEFS[key].space === 'dev'),
      admin: own.filter((key) => USAGE_FEATURE_DEFS[key].space === 'admin'),
    };

    for (const [visitIndex, visit] of member.visits.entries()) {
      const at = clock.at(
        visit.dayOffset,
        9 + (visitIndex % 9),
        (visitIndex * 7) % 60,
      );

      if (visit.opensSession) {
        pushUse(world, {
          key: ['sess', seq(memberIndex, 3), visit.sessionKey],
          feature: sessionOf[visit.space],
          actorKind: 'staff',
          staffProfileId: member.id,
          // `dev_connection` is campus-scoped and `admin_connection` global, which the
          // catalogue already says: the admin space is national.
          campusId:
            USAGE_FEATURE_DEFS[sessionOf[visit.space]].scope === 'global'
              ? null
              : member.campusId,
          eventId: null,
          occurredAt: at,
        });
      }

      // What they did once inside. A handful of screens per visit, walked from
      // their own set rather than drawn afresh, so the same member keeps using
      // the same things - which is what makes « ce qu'il n'a jamais ouvert »
      // mean something on their fiche.
      const pool = spaceOwn[visit.space];
      // Distinct features per visit: two rows of one feature in one 30-minute
      // slice share a dedupe key, which the unique constraint refuses.
      for (let i = 0; i < Math.min(3, pool.length); i += 1) {
        const feature = pool[(visitIndex * 3 + i) % pool.length]!;
        const definition = USAGE_FEATURE_DEFS[feature];
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
          key: ['staff', seq(memberIndex, 3), seq(visitIndex, 3), seq(i, 2)],
          feature,
          actorKind: 'staff',
          staffProfileId: member.id,
          campusId,
          eventId: event?.id ?? null,
          occurredAt: new Date(at.getTime() + i * 11 * 60 * 1000),
        });
      }
    }
  }

  // ── Talents: a monthly-rotating pseudonym and nothing else ────────────────
  for (const [index, feature] of adopted.entries()) {
    const definition = USAGE_FEATURE_DEFS[feature];
    if (definition.audience !== 'talent') continue;
    // Spread over months, because a distinct actor is counted PER MONTH: the
    // reported figure is the busiest month's, never a running total, and a
    // dataset sitting inside one month cannot tell the two apart.
    const monthsAgo = index % 5;

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
        occurredAt: clock.months(-monthsAgo, -i - 1),
      });
    }
  }

  // An admin looking at a campus while impersonating one of its members. The
  // aggregates filter these out, so a dataset without one cannot tell a working
  // filter from a forgotten one - and the flag is inside `dedupeKey` precisely
  // so an impersonated use and a real one are two rows rather than one lost.
  //
  // An admin who actually comes, and not `staff[0]`: only an admin can
  // impersonate, and the first member of the roster is the one the tiers make
  // « jamais connecté », so this row was the single line of usage on an account
  // the members page says has never been opened.
  const admin =
    staff.find(
      (member) => member.role === 'admin' && member.visits.length > 0,
    ) ?? staff.find((member) => member.visits.length > 0);
  if (admin) {
    const feature = USAGE_FEATURES.DEV_INSCRITS_VIEW;
    const event = opts.events[0];
    // The session that carried it. An impersonated request writes both rows,
    // exactly like any other: `hooks.server.ts` records the view and the
    // session from one context, and `resolveActor` attributes both to the
    // admin behind the session. Writing the view alone left a dev-space use
    // that belonged to no session at all, which is the shape this scenario
    // exists to make impossible.
    pushUse(world, {
      key: ['impersonated', 'connection'],
      feature: USAGE_FEATURES.DEV_CONNECTION,
      actorKind: 'staff',
      staffProfileId: admin.id,
      // Null, and so is the view row's below, because `resolveActor` writes
      // `campusId: null` for EVERY staff row of an impersonated request - the
      // campus being explored is not the admin's, and stamping it would credit
      // that campus with adoption an admin produced. Both rows come from one
      // request, so they cannot disagree; the view row carried the campus and
      // was a row the application has no way to write.
      campusId: null,
      eventId: null,
      impersonated: true,
      occurredAt: clock.at(-2, 15, 19),
    });
    pushUse(world, {
      key: ['impersonated'],
      feature,
      actorKind: 'staff',
      staffProfileId: admin.id,
      campusId: null,
      eventId: event?.id ?? null,
      impersonated: true,
      occurredAt: clock.at(-2, 15, 20),
    });
  }
}

/**
 * One row, with its idempotency key composed by the domain rather than here.
 *
 * The key used to be built at each call site, in `a:b:c` where the recorder
 * writes `a|b|c|slice`, and with no time component: two rows of one feature by
 * one actor were therefore impossible, which is what capped a seeded member at
 * two connections. `usageDedupeKey` is the recorder's own function, so a seeded
 * row is now shaped like one the application wrote.
 */
function pushUse(
  world: World,
  row: {
    key: string[];
    feature: UsageFeatureKey;
    actorKind: 'staff' | 'talent';
    staffProfileId?: string;
    actorHash?: string;
    campusId: string | null;
    eventId: string | null;
    occurredAt: Date;
    impersonated?: boolean;
  },
): void {
  const actorRef = row.staffProfileId ?? row.actorHash;
  if (!actorRef)
    throw new Error('Une ligne d’usage sans acteur ne peut pas être écrite.');
  world.buffer.usage_FeatureUse.push({
    id: id('ufu', ...row.key),
    feature: row.feature,
    actorKind: row.actorKind,
    staffProfileId: row.staffProfileId,
    actorHash: row.actorHash,
    campusId: row.campusId,
    eventId: row.eventId,
    impersonated: row.impersonated ?? false,
    dedupeKey: usageDedupeKey({
      feature: row.feature,
      actorRef,
      eventId: row.eventId,
      impersonated: row.impersonated,
      at: row.occurredAt,
    }),
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
  type Cell = {
    feature: string;
    actorKind: 'staff' | 'talent';
    campusId: string | null;
    month: string;
    uses: number;
    actors: Set<string>;
  };
  // The cell carries its own coordinates, so the map key only has to be unique
  // and nothing ever parses it back. It used to be four values joined on a raw
  // NUL byte and split again, which worked and made the file binary: `grep`
  // skipped it, `git diff` refused to show it, and a reviewer could not see the
  // separator at all.
  const cube = new Map<string, Cell>();
  const cellFor = (
    feature: string,
    actorKind: 'staff' | 'talent',
    campusId: string | null,
    month: string,
  ): Cell => {
    const key = JSON.stringify([feature, actorKind, campusId, month]);
    const existing = cube.get(key);
    if (existing) return existing;
    const cell: Cell = {
      feature,
      actorKind,
      campusId,
      month,
      uses: 0,
      actors: new Set<string>(),
    };
    cube.set(key, cell);
    return cell;
  };

  for (const row of world.buffer.usage_FeatureUse) {
    if (row.impersonated) continue;
    const cell = cellFor(
      row.feature as string,
      row.actorKind as 'staff' | 'talent',
      (row.campusId as string | null) ?? null,
      clock.monthKey(row.occurredAt as Date),
    );
    cell.uses += 1;
    cell.actors.add(
      (row.staffProfileId as string | null) ??
        (row.actorHash as string | null) ??
        '',
    );
  }

  // ── The reference half of the year-on-year comparison ─────────────────────
  //
  // `adminStats/featureUsage.ts` reads each complete month and its counterpart
  // twelve months earlier, and the raw window is twelve months, so every
  // counterpart falls outside it and can only come from the cube. The cube held
  // exactly one archived month, on one feature, so `readComparison` answered
  // `null` for everything on every dataset ever generated: a branch no screen
  // could reach and no check could see.
  //
  // Only months the raw table cannot also cover, or the two stores would
  // disagree about a month they both hold - which is the one thing folding
  // rather than inventing exists to prevent.
  const oldestRawMonth = clock.monthKey(
    clock.months(-USAGE_RAW_RETENTION_MONTHS, 0),
  );
  for (const cell of [...cube.values()]) {
    const lastYear = shiftMonthKey(cell.month, -12);
    if (lastYear >= oldestRawMonth) continue;
    const before = cellFor(
      cell.feature,
      cell.actorKind,
      cell.campusId,
      lastYear,
    );
    // Fewer than this year, so the comparison reads as growth rather than as a
    // copy: a movement of zero everywhere is indistinguishable from a figure
    // that is not being computed.
    before.uses = Math.max(1, Math.round(cell.uses * 0.6));
    for (const actor of [...cell.actors].slice(
      0,
      Math.max(1, Math.ceil(cell.actors.size * 0.6)),
    ))
      before.actors.add(`${actor}-an-passe`);
  }

  // One month past the retention window carrying a feature nothing else wrote,
  // so the boundary is exercised even if the loop above ever stops producing
  // rows: the shape a rolled-up-then-purged month actually has.
  const archived = cellFor(
    USAGE_FEATURES.DEV_INSCRITS_VIEW,
    'staff',
    null,
    clock.monthKey(clock.months(-(USAGE_RAW_RETENTION_MONTHS + 1), 0)),
  );
  archived.uses = 42;
  for (const actor of ['archived-1', 'archived-2', 'archived-3'])
    archived.actors.add(actor);

  for (const cell of cube.values()) {
    world.buffer.usage_FeatureMonthly.push({
      id: id(
        'ufm',
        cell.feature,
        cell.actorKind,
        cell.campusId ?? 'global',
        cell.month,
      ),
      feature: cell.feature,
      actorKind: cell.actorKind,
      campusId: cell.campusId,
      month: cell.month,
      uses: cell.uses,
      distinctActors: cell.actors.size,
      computedAt: clock.today,
    });
  }
}

/**
 * `2026-03` twelve months back. Local arithmetic on a `YYYY-MM` key, because
 * `server/usage/months.ts` holds the same shift and does not resolve outside
 * Vite. Kept to the one case this file needs rather than reproducing that
 * module.
 */
function shiftMonthKey(month: string, by: number): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  const total = year * 12 + (index - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
