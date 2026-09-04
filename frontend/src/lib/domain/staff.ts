import type { StaffRole } from '@prisma/client';
import type { StaffGroup } from './permissions';

/**
 * How a staff attribution reads once the account behind it is gone.
 *
 * Every attribution FK on a shared record is `SetNull`, so what a colleague
 * wrote, conducted or uploaded outlives their departure and only loses their
 * name. One string rather than a fallback per screen, because a closing, a
 * document and a welcome page all have to say the same thing about the same
 * absent person.
 */
export const FORMER_STAFF_LABEL = 'Ancien membre';

export const staffRoles = ['admin', 'superdev', 'dev'] as const;

export const STAFF_ROLES: readonly {
  value: StaffRole;
  label: string;
  description: string;
}[] = [
  {
    value: 'admin',
    label: 'Admin',
    description:
      'Accès plateforme complet, multi-campus. Gestion utilisateurs, impersonation, opérations globales.',
  },
  {
    value: 'superdev',
    label: 'Référent Dev',
    description:
      'Lead de l’espace dev du campus. Gère l’équipe, importe les cohortes, supprime, configure.',
  },
  {
    value: 'dev',
    label: 'Dev',
    description:
      'Membre dev du campus. Opérations quotidiennes : participants, closings, mises à jour.',
  },
];

export function getStaffRoleLabel(role: string | null | undefined): string {
  return STAFF_ROLES.find((r) => r.value === role)?.label ?? 'Aucun rôle';
}

export type StaffSpacePath = '/staff/admin' | '/staff/dev';

export function getStaffRoleRedirectPath(
  staffRole: StaffRole | null | undefined,
): StaffSpacePath | null {
  switch (staffRole) {
    case 'admin':
      return '/staff/admin';
    case 'superdev':
    case 'dev':
      return '/staff/dev';
    default:
      return null;
  }
}

/**
 * The campus-scoped staff spaces an admin can drop into to see a campus as its
 * own team does (admin is excluded on purpose: it isn't campus-scoped). `group`
 * is the role set that can stand in for the campus in that space; when
 * resolving a representative member to impersonate, prefer the lead (superdev
 * outranks dev, see `staffRoles` order) so the admin lands with the fullest
 * view. Reuses the permissions groups rather than inlining role arrays.
 */
export type StaffSpaceId = 'dev';

export const STAFF_SPACES: readonly {
  id: StaffSpaceId;
  label: string;
  group: StaffGroup;
}[] = [{ id: 'dev', label: 'Dev', group: 'devMember' }];

/**
 * StaffProfile.staffRole is the source of truth for what a user can do inside
 * the app; bauth_user.role is BetterAuth's admin-plugin gate. They must agree
 * (`admin` ↔ `admin`, anything else ↔ `staff`); otherwise impersonation,
 * banning, etc. desync with the in-app role.
 *
 * Callers that change one MUST change the other in the same transaction. Use
 * this helper as the single source for the mapping.
 */
export function bauthRoleForStaffRole(
  staffRole: StaffRole | null | undefined,
): 'admin' | 'staff' {
  return staffRole === 'admin' ? 'admin' : 'staff';
}

/**
 * The `bauth_user.role` values that mean "this login is a staff member".
 *
 * Derived from `bauthRoleForStaffRole` over every `StaffRole` rather than
 * written out, so it is exactly what that mapping can produce and cannot come
 * to disagree with it. The OTP audience resolver
 * (`$lib/server/auth/otpAudience`) refuses on this in addition to the presence
 * of a `StaffProfile`: the profile is the truth about what someone can do in
 * the app, but this column is what BetterAuth's admin plugin gates
 * impersonation on, so a row carrying it is staff-capable even with no profile
 * attached.
 */
export const BAUTH_STAFF_ROLES: readonly string[] = [
  ...new Set(staffRoles.map(bauthRoleForStaffRole)),
];
