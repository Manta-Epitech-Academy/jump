/**
 * Salesforce CampaignMember status mapping.
 *
 * Statuses are Salesforce vocabulary, stored normalized (trimmed + uppercased)
 * in `Participation.sfMemberStatus`. Never expose raw words to users; French
 * labels only.
 *
 * Business rules (July 2026 seminar, firm):
 *   - The worker syncs ALL campaign members regardless of status.
 *   - Visible statuses in the dev space: READY and MEET only.
 *   - CONNECTED and DESISTED are never shown anywhere in dev.
 *   - For a PAST event: MEET = present, READY = absent.
 */

import type { Prisma } from '@prisma/client';

/** Statuses shown in the dev workspace. Null (legacy) is also visible. */
export const SF_VISIBLE_STATUSES = ['READY', 'MEET'] as const;

/**
 * Prisma where-fragment for the participations visible in the dev workspace:
 * the visible SF statuses plus legacy rows synced before the column existed
 * (`null`). Spread into any `Participation` where / relation filter so every dev
 * count, list and breakdown stays on one cohort definition and can't drift.
 */
export const visibleParticipationWhere = {
  OR: [
    { sfMemberStatus: { in: [...SF_VISIBLE_STATUSES] } },
    { sfMemberStatus: null },
  ],
} satisfies Prisma.ParticipationWhereInput;

/**
 * Whether a participation should appear in the dev workspace.
 * Null = legacy row synced before the status column existed: keep visible.
 */
export function isVisibleInDevSpace(status: string | null): boolean {
  if (status === null) return true;
  const upper = status.trim().toUpperCase();
  return (SF_VISIBLE_STATUSES as readonly string[]).includes(upper);
}

/**
 * For past events only: derive a presence outcome from the SF member status.
 *   - MEET -> 'present' (they attended)
 *   - READY -> 'absent' (said they would come, did not)
 *   - anything else -> null (no meaningful presence signal)
 */
export function pastEventPresence(
  status: string | null,
): 'present' | 'absent' | null {
  if (status === null) return null;
  const upper = status.trim().toUpperCase();
  if (upper === 'MEET') return 'present';
  if (upper === 'READY') return 'absent';
  return null;
}

/** Normalize a raw SF status for DB storage: trim + uppercase. */
export function normalizeSfStatus(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

/** French label for a presence outcome (past events). */
export function presenceLabel(presence: 'present' | 'absent'): string {
  return presence === 'present' ? 'Présent' : 'Absent';
}
