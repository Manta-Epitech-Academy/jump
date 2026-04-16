import type { StaffRole } from '@prisma/client';

export const staffRoles = [
  'admin',
  'superdev',
  'dev',
  'peda',
  'manta',
] as const;

export const STAFF_ROLES: readonly { value: StaffRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'superdev', label: 'SuperDev' },
  { value: 'dev', label: 'Dev' },
  { value: 'peda', label: 'Péda' },
  { value: 'manta', label: 'Manta' },
];

export function getStaffRoleLabel(role: string | null | undefined): string {
  return STAFF_ROLES.find((r) => r.value === role)?.label ?? 'Aucun rôle';
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
