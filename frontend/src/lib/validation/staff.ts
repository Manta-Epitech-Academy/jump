import { z } from 'zod';
import { STAFF_GROUPS } from '$lib/domain/permissions';

const epitechEmail = z
  .email('Adresse email invalide')
  .refine((v) => v.toLowerCase().endsWith('@epitech.eu'), {
    message: 'Doit être une adresse @epitech.eu',
  });

// `admin` excluded — admin role is provisioned manually, not self-replicating.
const invitableRoles = STAFF_GROUPS.campusManageable;

export const createInvitationSchema = z.object({
  email: epitechEmail,
  campusId: z.string().min(1, 'Campus requis'),
  staffRole: z.enum(invitableRoles).default('superdev'),
});

export const createAdminInvitationSchema = z.object({
  email: epitechEmail,
  campusId: z.string().min(1, 'Campus requis'),
  staffRole: z.enum(['admin'].concat(invitableRoles)).default('admin'),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const createSuperDevInvitationSchema = z.object({
  email: epitechEmail,
  staffRole: z.enum(invitableRoles).default('manta'),
});

export type CreateSuperDevInvitationInput = z.infer<
  typeof createSuperDevInvitationSchema
>;

export const updateMemberRoleSchema = z.object({
  userId: z.string().min(1),
  staffRole: z.enum(invitableRoles),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
