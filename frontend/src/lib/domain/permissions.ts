import type { StaffRole } from '@prisma/client';

/**
 * Single source of truth for staff role-based gating.
 *
 * Staff roles group into tiers of access. A handful of groups covers every
 * gate we need. If you're about to inline a role array somewhere, add a group
 * here instead.
 *
 *   devLead    — dev workspace lead (superdev only)
 *   devMember  — dev workspace member (superdev + dev)
 *   pedaLead   — pedago workspace lead (peda only)
 *   pedaMember — pedago workspace member (peda + manta)
 *   leads      — leads across both workspaces (superdev + peda)
 *
 * Usage:
 *   • Client:  <Gated group="devLead">...</Gated>   (reads role from page state)
 *   • Server:  requireStaffGroup(locals, 'devLead')  in $lib/server/auth/guards
 *   • Routes:  STAFF_ROLE_GATES entries reference a group name in guards.ts
 *
 * UI pattern rule (pick one per site):
 *   • Hide                 — nav entries to lead-only destinations (sidebars, menus)
 *   • Disable + tooltip    — mutating controls visible on shared screens
 *   • Readonly banner      — whole-page readonly context (e.g. manta on planning)
 *   • Redirect / 403       — direct URL access to lead-only routes (STAFF_ROLE_GATES)
 */
export const STAFF_GROUPS = {
  devLead: ['superdev'],
  devMember: ['superdev', 'dev'],
  pedaLead: ['peda'],
  pedaMember: ['peda', 'manta'],
  leads: ['superdev', 'peda'],
  // Roles a superdev may invite / assign on their campus. Excludes `admin`
  // (admin role is provisioned manually, not self-replicating).
  campusManageable: ['superdev', 'dev', 'peda', 'manta'],
} as const satisfies Record<string, readonly StaffRole[]>;

export type StaffGroup = keyof typeof STAFF_GROUPS;

export function can(
  group: StaffGroup,
  role: StaffRole | null | undefined,
): boolean {
  if (!role) return false;
  return (STAFF_GROUPS[group] as readonly StaffRole[]).includes(role);
}

export function rolesIn(group: StaffGroup): readonly StaffRole[] {
  return STAFF_GROUPS[group];
}
