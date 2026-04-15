import type { StaffRole } from '@prisma/client';

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
