import { z } from 'zod';
import { INVITABLE_STAFF_ROLES } from '$lib/domain/permissions';

const epitechEmail = z
  .email('Adresse email invalide')
  .refine((v) => v.toLowerCase().endsWith('@epitech.eu'), {
    message: 'Doit être une adresse @epitech.eu',
  });

const invitableRoles = INVITABLE_STAFF_ROLES;

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
