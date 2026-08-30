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
    world.buffer.syncError.push({
      id: id('sye', seq(index, 3)),
      errorType: 'DUPLICATE_EMAIL',
      email: talent.email,
      attemptedExtId: `sf_dup_${seq(index, 6)}`,
      existingExtId: `sf_${seq(index, 6)}`,
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
    world.buffer.talentDeletionRequest.push({
      id: id('tdr', status),
      talentId: talent.id,
      status,
      reason: 'Demande du responsable légal.',
      requestedAt: world.ctx.clock.days(-40 + index),
      resolvedAt:
        status === 'pending' ? null : world.ctx.clock.days(-30 + index),
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
  talent: TalentRef,
  staff: StaffRef,
): void {
  world.buffer.closing_ResetEvent.push({
    id: id('cre', talent.id.replace(/^sd_/, '')),
    talentId: talent.id,
    conductedByStaffId: staff.id,
    conductedAt: world.ctx.clock.days(-45),
    resetByStaffId: staff.id,
    reason: 'Grille conduite sur le mauvais événement.',
    createdAt: world.ctx.clock.days(-44),
  });
}

/** An identity repair, the trace the auth-conflict tool leaves behind. */
export function addIdentityRepair(
  world: World,
  talent: TalentRef,
  staff: StaffRef,
): void {
  world.buffer.authIdentityRepair.push({
    id: id('air', talent.id.replace(/^sd_/, '')),
    talentId: talent.id,
    kind: 'relink',
    toUserId: talent.userId,
    fromEmail: `ancienne.${talent.email}`,
    toEmail: talent.email,
    // No foreign key on purpose upstream: an audit row must outlive the account
    // it names, so the resolver is a bare string.
    resolvedBy: staff.userId,
    resolvedAt: world.ctx.clock.days(-15),
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
      campusId: campus.id,
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
      status: 200,
      createdAt: clock.days(-1),
    });
  }
}

/**
 * Usage rows, in both actor regimes.
 *
 * Staff are identified because they are adults and employees; talents get a
 * monthly-rotating pseudonym and nothing else, which is why the talent metric is
 * monthly-active and never annual. There is no `path`, no `userAgent` and no
 * `talentId` here, and that absence is the privacy boundary rather than an
 * omission - the same reason the real recorder writes none of them.
 */
export function addUsage(
  world: World,
  opts: {
    staff: readonly StaffRef[];
    campus: CampusRef;
    event: EventRef;
    talentCount: number;
  },
): void {
  const clock = world.ctx.clock;
  const features = [
    'emargement_open',
    'inscrits_export',
    'closing_conduct',
    'broadcast_send',
  ];

  for (const [index, member] of opts.staff.entries()) {
    for (const [featureIndex, feature] of features.entries()) {
      world.buffer.usage_FeatureUse.push({
        id: id('ufu', 'staff', seq(index, 3), seq(featureIndex, 2)),
        feature,
        actorKind: 'staff',
        staffProfileId: member.id,
        campusId: member.campusId,
        eventId: opts.event.id,
        dedupeKey: `${member.id}:${opts.event.id}:${feature}`,
        occurredAt: clock.days(-index - 1),
      });
    }
  }

  // Enough distinct pseudonyms to sit above the five-actor floor, so the matrix
  // has at least one cell it does NOT have to mask. A dataset that only produces
  // masked cells cannot tell a working mask from a broken query.
  for (let i = 0; i < opts.talentCount; i += 1) {
    world.buffer.usage_FeatureUse.push({
      id: id('ufu', 'talent', seq(i, 3)),
      feature: 'talent_dashboard_view',
      actorKind: 'talent',
      actorHash: `seedhash${seq(i, 4)}`,
      campusId: opts.campus.id,
      dedupeKey: `seedhash${seq(i, 4)}:talent_dashboard_view`,
      occurredAt: clock.days(-i - 1),
    });
  }
}
