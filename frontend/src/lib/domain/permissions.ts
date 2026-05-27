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
  // Roles eligible to be assigned as the staff side of an Interview, and
  // permitted to fill the grid for any interview they were assigned to. Dev
  // team owns the workflow (scheduling, reassignment, autoSchedule) but any
  // staff role on a campus can run an interview and capture its outcome.
  interviewers: ['superdev', 'dev', 'peda', 'manta'],
  // Roles a superdev may invite / assign on their campus. Excludes `admin`
  // (admin role is provisioned manually, not self-replicating).
  campusManageable: ['superdev', 'dev', 'peda', 'manta'],
  // Roles allowed to arm "real sends" on a trapped (dev/staging) env — lifting
  // the mail/SMS redirect to reach real recipients. Dangerous (recipients are
  // minors), so restricted to space leads + admin. See `$lib/server/armRealSends`.
  realSendArmers: ['superdev', 'peda', 'admin'],
} as const satisfies Record<string, readonly StaffRole[]>;

export type StaffGroup = keyof typeof STAFF_GROUPS;

export type StaffGroupDescription = {
  label: string;
  contact: string;
};

const STAFF_GROUP_DESCRIPTIONS: Record<StaffGroup, StaffGroupDescription> = {
  devLead: {
    label: 'Responsable dev',
    contact: 'un superdev de votre campus',
  },
  devMember: {
    label: 'Équipe dev',
    contact: 'un dev ou un superdev de votre campus',
  },
  pedaLead: {
    label: 'Responsable péda',
    contact: 'un référent péda de votre campus',
  },
  pedaMember: {
    label: 'Équipe péda',
    contact: 'un référent péda ou une manta de votre campus',
  },
  leads: {
    label: "Responsable d'espace",
    contact: 'un superdev ou un référent péda',
  },
  interviewers: {
    label: 'Membre interviewer',
    contact: 'un membre staff de votre campus',
  },
  campusManageable: {
    label: 'Membre staff',
    contact: 'un responsable de votre campus',
  },
  realSendArmers: {
    label: "Responsable d'espace ou admin",
    contact: 'un superdev, un référent péda ou un admin',
  },
};

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

export function describeGroup(group: StaffGroup): StaffGroupDescription {
  return STAFF_GROUP_DESCRIPTIONS[group];
}
