import type { StaffRole } from '@prisma/client';

/**
 * Single source of truth for staff role-based gating.
 *
 * Staff roles group into tiers of access. A handful of groups covers every
 * gate we need. If you're about to inline a role array somewhere, add a group
 * here instead.
 *
 *   devMember       : dev workspace member (superdev + dev)
 *   realSendArmers  : may arm real outbound sends on a trapped env (admin)
 *
 * There is deliberately no superdev-only group: today `superdev` and `dev` can
 * do exactly the same things, and the last gate that told them apart went away
 * with the dev CSV import page. Add one back here (never a bare `['superdev']`
 * at a call site) the day a lead-only action actually exists.
 *
 * Usage:
 *   • Client:  can('devMember', page.data.staffProfile?.staffRole)  in a $derived
 *   • Server:  requireStaffGroup(locals, 'devMember')  in $lib/server/auth/guards,
 *              at the top of a `load` to gate a route, or in an action to gate
 *              one mutation
 *
 * UI pattern rule (pick one per site):
 *   • Hide                 : nav entries to restricted destinations (sidebars, menus)
 *   • Disable + tooltip    : mutating controls visible on shared screens
 *   • Redirect / 403       : direct URL access, via requireStaffGroup in the load
 */
const STAFF_GROUPS = {
  devMember: ['superdev', 'dev'],
  // Roles allowed to manage the dev-redirect controls on a trapped (dev/staging)
  // env: arming "real sends" (lifting the mail/SMS redirect to reach real
  // recipients: dangerous, recipients are minors) and arming a login-redirect
  // pin (routing trapped OTP mail to themselves: benign, stays trapped).
  // Restricted to admin only; the controls live in the admin space. See
  // `$lib/server/armRealSends` and `$lib/server/devRedirectPin`.
  realSendArmers: ['admin'],
} as const satisfies Record<string, readonly StaffRole[]>;

/**
 * Roles a superdev may invite / assign on their campus. Excludes `admin` (that
 * role is provisioned manually, not self-replicating). A catalogue of assignable
 * roles, not an access gate, so it stays out of `STAFF_GROUPS`.
 */
export const INVITABLE_STAFF_ROLES = [
  'superdev',
  'dev',
] as const satisfies readonly StaffRole[];

export type StaffGroup = keyof typeof STAFF_GROUPS;

export type StaffGroupDescription = {
  label: string;
  contact: string;
};

const STAFF_GROUP_DESCRIPTIONS: Record<StaffGroup, StaffGroupDescription> = {
  devMember: {
    label: 'Équipe dev',
    contact: 'un dev ou un superdev de votre campus',
  },
  realSendArmers: {
    label: 'Admin',
    contact: 'un admin',
  },
};

export function can(
  group: StaffGroup,
  role: StaffRole | null | undefined,
): boolean {
  if (!role) return false;
  return (STAFF_GROUPS[group] as readonly StaffRole[]).includes(role);
}

export function describeGroup(group: StaffGroup): StaffGroupDescription {
  return STAFF_GROUP_DESCRIPTIONS[group];
}
