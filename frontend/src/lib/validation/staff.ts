import { z } from 'zod';
import { staffRoles } from '$lib/domain/staff';

const epitechEmail = z
  .email('Adresse email invalide')
  .refine((v) => v.toLowerCase().endsWith('@epitech.eu'), {
    message: 'Doit être une adresse @epitech.eu',
  });

export const createInvitationSchema = z.object({
  email: epitechEmail,
  campusId: z.string().min(1, 'Campus requis'),
  staffRole: z.enum(staffRoles).default('superdev'),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

const superdevRoles = ['superdev', 'dev', 'peda', 'manta'] as const;

export const createSuperDevInvitationSchema = z.object({
  email: epitechEmail,
  staffRole: z.enum(superdevRoles).default('manta'),
});

export type CreateSuperDevInvitationInput = z.infer<
  typeof createSuperDevInvitationSchema
>;

export const updateMemberRoleSchema = z.object({
  userId: z.string().min(1),
  staffRole: z.enum(superdevRoles),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
