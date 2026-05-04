import type { StaffRole } from '@prisma/client';

export const staffRoles = [
  'admin',
  'superdev',
  'dev',
  'peda',
  'manta',
] as const;

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
      'Membre dev du campus. Opérations quotidiennes : participants, entretiens, mises à jour.',
  },
  {
    value: 'peda',
    label: 'Référent Pédago',
    description:
      'Lead de l’espace pédago. Gère le planning, les factions, et supervise les mantas.',
  },
  {
    value: 'manta',
    label: 'Manta',
    description:
      'Accompagnement terrain côté pédago. Cockpit, suivi élèves. Planning en lecture seule.',
  },
];

export function getStaffRoleLabel(role: string | null | undefined): string {
  return STAFF_ROLES.find((r) => r.value === role)?.label ?? 'Aucun rôle';
}

export function getStaffRoleCampusSuffix(
  role: string | null | undefined,
  campusName: string | null | undefined,
): string {
  if (!role || !campusName) return '';
  if (!STAFF_ROLES.some((r) => r.value === role)) return '';
  return ` du campus de ${campusName}`;
}

export function getStaffRoleDescription(
  role: string | null | undefined,
): string {
  return STAFF_ROLES.find((r) => r.value === role)?.description ?? '';
}

export type StaffSpacePath = '/staff/admin' | '/staff/dev' | '/staff/pedago';

export function getStaffRoleRedirectPath(
  staffRole: StaffRole | null | undefined,
): StaffSpacePath | null {
  switch (staffRole) {
    case 'admin':
      return '/staff/admin';
    case 'superdev':
    case 'dev':
      return '/staff/dev';
    case 'peda':
    case 'manta':
      return '/staff/pedago';
    default:
      return null;
  }
}

/**
 * StaffProfile.staffRole is the source of truth for what a user can do inside
 * the app; bauth_user.role is BetterAuth's admin-plugin gate. They must agree
 * (`admin` ↔ `admin`, anything else ↔ `staff`) — otherwise impersonation,
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
