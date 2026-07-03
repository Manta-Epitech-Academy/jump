import type {
  BroadcastAudience,
  BroadcastSourceFilter,
  Prisma,
  StaffRole,
} from '@prisma/client';
import { prisma } from '$lib/server/db';
import type {
  BroadcastFilters,
  ExcludedRecipient,
  RecipientExclusionReason,
  RecipientRole,
} from '$lib/domain/broadcasts';
import { xpRangeForLevel } from '$lib/domain/xp';
import {
  parentBlockedWhere,
  parentCompleteWhere,
} from '$lib/server/db/stageCompliance';

export interface RecipientSpec {
  campusId: string;
  audience: BroadcastAudience;
  eventId?: string | null;
  filters?: BroadcastFilters | null;
  sourceBroadcastId?: string | null;
  sourceFilter?: BroadcastSourceFilter | null;
}

export interface ResolvedRecipient {
  talentId: string | null;
  staffUserId: string | null;
  parentOfTalentId: string | null;
  prenom: string;
  nom: string;
  role: RecipientRole;
  email: string | null;
  phone: string | null;
  campusName: string;
}

export interface ResolveResult {
  recipients: ResolvedRecipient[];
  excluded: { reason: RecipientExclusionReason; count: number }[];
  excludedRecipients: ExcludedRecipient[];
}

const AUDIENCE_TO_STAFF_ROLE: Record<
  Exclude<BroadcastAudience, 'talent' | 'parent'>,
  StaffRole
> = {
  dev: 'dev',
  superdev: 'superdev',
};

/**
 * Resolve a list of recipients for a broadcast spec.
 *
 * - For audience `talent`/`parent`: queries Talent via Participation (campus
 *   membership), applies filters, then projects to talent or parent contact.
 * - For staff audiences: queries StaffProfile by role + campus.
 * - For retargeting: starts from the source broadcast's recipients (filtered
 *   by openedAt) and re-resolves through the new audience type.
 *
 * Charter status is not enforced here — admins control it via the explicit
 * "charterSigned" filter.
 */
export async function resolveRecipients(
  spec: RecipientSpec,
  channel: 'mail' | 'sms',
): Promise<ResolveResult> {
  if (spec.audience === 'talent' || spec.audience === 'parent') {
    return resolveTalentBased(spec, channel);
  }
  return resolveStaffBased(spec, channel);
}

async function resolveTalentBased(
  spec: RecipientSpec,
  channel: 'mail' | 'sms',
): Promise<ResolveResult> {
  const talentIds = await pickTalentIds(spec);
  if (talentIds.length === 0) {
    return { recipients: [], excluded: [], excludedRecipients: [] };
  }

  const talents = await prisma.talent.findMany({
    where: { id: { in: talentIds } },
    select: {
      id: true,
      prenom: true,
      nom: true,
      user: { select: { email: true } },
      phone: true,
      parentEmail: true,
      parentPhone: true,
      parentPrenom: true,
      parentNom: true,
      participations: {
        where: { campusId: spec.campusId },
        select: { campus: { select: { name: true } } },
        take: 1,
      },
    },
  });

  const excludedCounts = {
    no_email: 0,
    no_phone: 0,
  };
  const recipients: ResolvedRecipient[] = [];
  const excludedRecipients: ExcludedRecipient[] = [];
  const isParent = spec.audience === 'parent';
  const role: RecipientRole = isParent ? 'parent' : 'talent';

  for (const t of talents) {
    const campusName = t.participations[0]?.campus.name ?? '';

    // For the parent audience, a talent who hasn't registered a guardian yet
    // (never passed the onboarding "contacts d'urgence" step) has no parent to
    // reach - that's a non-recipient, not an unreachable one. Skip it so it
    // doesn't inflate the "exclus" count with phantom empty-name rows. A
    // registered parent missing only this channel's contact (e.g. an email but
    // no phone for an SMS send) still counts as a real exclusion below.
    if (
      isParent &&
      !t.parentEmail &&
      !t.parentPhone &&
      !t.parentNom &&
      !t.parentPrenom
    ) {
      continue;
    }

    const email = isParent ? t.parentEmail : (t.user?.email ?? null);
    const phone = isParent ? t.parentPhone : t.phone;
    const prenom = isParent ? (t.parentPrenom ?? '') : t.prenom;
    const nom = isParent ? (t.parentNom ?? '') : t.nom;

    if (channel === 'mail' && !email) {
      excludedCounts.no_email++;
      excludedRecipients.push({ prenom, nom, role, reason: 'no_email' });
      continue;
    }
    if (channel === 'sms' && !phone) {
      excludedCounts.no_phone++;
      excludedRecipients.push({ prenom, nom, role, reason: 'no_phone' });
      continue;
    }

    recipients.push({
      talentId: isParent ? null : t.id,
      staffUserId: null,
      parentOfTalentId: isParent ? t.id : null,
      prenom,
      nom,
      role,
      email,
      phone,
      campusName,
    });
  }

  return {
    recipients,
    excluded: formatExcluded(excludedCounts),
    excludedRecipients,
  };
}

async function pickTalentIds(spec: RecipientSpec): Promise<string[]> {
  // Retargeting: base set comes from a past broadcast's recipients.
  if (spec.sourceBroadcastId) {
    const openedAtFilter = sourceOpenedAtFilter(spec.sourceFilter);
    const rows = await prisma.broadcastRecipient.findMany({
      where: {
        broadcastId: spec.sourceBroadcastId,
        ...openedAtFilter,
        OR: [{ talentId: { not: null } }, { parentOfTalentId: { not: null } }],
      },
      select: { talentId: true, parentOfTalentId: true },
    });
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.talentId) ids.add(r.talentId);
      if (r.parentOfTalentId) ids.add(r.parentOfTalentId);
    }
    if (ids.size === 0) return [];

    // Re-apply spec filters on top of retargeted set.
    const refined = await prisma.talent.findMany({
      where: {
        id: { in: [...ids] },
        ...talentWhere(spec),
      },
      select: { id: true },
    });
    return refined.map((t) => t.id);
  }

  const talents = await prisma.talent.findMany({
    where: talentWhere(spec),
    select: { id: true },
  });
  return talents.map((t) => t.id);
}

function talentWhere(spec: RecipientSpec): Prisma.TalentWhereInput {
  const where: Prisma.TalentWhereInput = {
    participations: { some: { campusId: spec.campusId } },
  };

  if (spec.eventId) {
    where.participations = {
      some: { campusId: spec.campusId, eventId: spec.eventId },
    };
  }

  const f = spec.filters;
  if (!f) return where;

  const and: Prisma.TalentWhereInput[] = [];

  if (f.niveau?.length) and.push({ niveau: { in: f.niveau } });
  // Level is derived from xp (no stored column) — translate each chosen tier
  // into its xp range and OR them together.
  if (f.jumpLevel?.length) {
    and.push({
      OR: f.jumpLevel.map((lvl) => {
        const { min, maxExclusive } = xpRangeForLevel(lvl);
        return maxExclusive === null
          ? { xp: { gte: min } }
          : { xp: { gte: min, lt: maxExclusive } };
      }),
    });
  }
  if (f.charterSigned === 'yes') and.push({ charterAcceptedAt: { not: null } });
  if (f.charterSigned === 'no') and.push({ charterAcceptedAt: null });
  // Règlement intérieur: the talent's own signature (`rulesSignedAt`) and the
  // legal guardian's online co-signature (`parentRulesSignedAt`, the canonical
  // minor-compliance signal — see domain/stageCompliance `isRulesCompliant`).
  if (f.rulesSigned === 'yes') and.push({ rulesSignedAt: { not: null } });
  if (f.rulesSigned === 'no') and.push({ rulesSignedAt: null });
  if (f.parentRulesSigned === 'yes')
    and.push({ parentRulesSignedAt: { not: null } });
  if (f.parentRulesSigned === 'no') and.push({ parentRulesSignedAt: null });
  // Overall parent status: the union of the two acts (règlement co-signature +
  // image-rights decision) that the granular flags above can only AND. "pending"
  // = at least one still owed, the "relance every blocked parent" target.
  if (f.parentStatus === 'pending') and.push(parentBlockedWhere);
  if (f.parentStatus === 'complete') and.push(parentCompleteWhere);
  // Image rights: OR the selected states. `undecided` is the absence of a
  // decision; `accepted`/`refused` match the stored enum directly.
  if (f.imageRights?.length) {
    and.push({
      OR: f.imageRights.map((status) =>
        status === 'undecided'
          ? { imageRightsDecidedAt: null }
          : { imageRightsDecision: status },
      ),
    });
  }

  const now = new Date();
  if (f.hasPastEvent === 'yes')
    and.push({ participations: { some: { event: { date: { lt: now } } } } });
  if (f.hasPastEvent === 'no')
    and.push({ participations: { none: { event: { date: { lt: now } } } } });
  if (f.hasFutureEvent === 'yes')
    and.push({ participations: { some: { event: { date: { gt: now } } } } });
  if (f.hasFutureEvent === 'no')
    and.push({ participations: { none: { event: { date: { gt: now } } } } });

  if (and.length) where.AND = and;
  return where;
}

function sourceOpenedAtFilter(
  filter: BroadcastSourceFilter | null | undefined,
): Prisma.BroadcastRecipientWhereInput {
  if (filter === 'opened') return { openedAt: { not: null } };
  if (filter === 'not_opened') return { openedAt: null };
  return {};
}

async function resolveStaffBased(
  spec: RecipientSpec,
  channel: 'mail' | 'sms',
): Promise<ResolveResult> {
  const role =
    AUDIENCE_TO_STAFF_ROLE[
      spec.audience as Exclude<BroadcastAudience, 'talent' | 'parent'>
    ];

  // Retargeting on staff: pick staff users that received the source.
  let userIdFilter: Prisma.StringFilter | undefined;
  if (spec.sourceBroadcastId) {
    const openedAtFilter = sourceOpenedAtFilter(spec.sourceFilter);
    const rows = await prisma.broadcastRecipient.findMany({
      where: {
        broadcastId: spec.sourceBroadcastId,
        ...openedAtFilter,
        staffUserId: { not: null },
      },
      select: { staffUserId: true },
    });
    const ids = rows.map((r) => r.staffUserId).filter((v): v is string => !!v);
    if (ids.length === 0)
      return { recipients: [], excluded: [], excludedRecipients: [] };
    userIdFilter = { in: ids };
  }

  const profiles = await prisma.staffProfile.findMany({
    where: {
      staffRole: role,
      campusId: spec.campusId,
      ...(userIdFilter ? { userId: userIdFilter } : {}),
      // Staff audiences carry no per-event assignment, so the event is ignored
      // when resolving them.
    },
    select: {
      campus: { select: { name: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const excludedCounts = { no_email: 0, no_phone: 0 };
  const recipients: ResolvedRecipient[] = [];
  const excludedRecipients: ExcludedRecipient[] = [];

  for (const p of profiles) {
    const fullName = p.user.name ?? '';
    const [first, ...rest] = fullName.split(' ');
    const prenom = first ?? '';
    const nom = rest.join(' ');
    const email = p.user.email;
    const phone = null; // staff phones not stored

    if (channel === 'mail' && !email) {
      excludedCounts.no_email++;
      excludedRecipients.push({
        prenom,
        nom,
        role: 'staff',
        reason: 'no_email',
      });
      continue;
    }
    if (channel === 'sms') {
      excludedCounts.no_phone++;
      excludedRecipients.push({
        prenom,
        nom,
        role: 'staff',
        reason: 'no_phone',
      });
      continue;
    }

    recipients.push({
      talentId: null,
      staffUserId: p.user.id,
      parentOfTalentId: null,
      prenom,
      nom,
      role: 'staff',
      email,
      phone,
      campusName: p.campus?.name ?? '',
    });
  }

  return {
    recipients,
    excluded: formatExcluded(excludedCounts),
    excludedRecipients,
  };
}

function formatExcluded(counts: {
  no_email: number;
  no_phone: number;
}): ResolveResult['excluded'] {
  const out: ResolveResult['excluded'] = [];
  if (counts.no_email > 0)
    out.push({ reason: 'no_email', count: counts.no_email });
  if (counts.no_phone > 0)
    out.push({ reason: 'no_phone', count: counts.no_phone });
  return out;
}
