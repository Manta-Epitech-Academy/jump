import { z } from 'zod';
import { STAFF_GROUPS } from '$lib/domain/permissions';

const epitechEmail = z
  .email('Adresse email invalide')
  .refine((v) => v.toLowerCase().endsWith('@epitech.eu'), {
    message: 'Doit être une adresse @epitech.eu',
  });

const invitableRoles = STAFF_GROUPS.campusManageable;

export const createAdminInvitationSchema = z
  .object({
    email: epitechEmail,
    campusId: z.string().default(''),
    staffRole: z.enum(['admin', ...invitableRoles] as const).default('dev'),
  })
  .refine((v) => v.staffRole === 'admin' || v.campusId.length > 0, {
    message: 'Campus requis',
    path: ['campusId'],
  });
