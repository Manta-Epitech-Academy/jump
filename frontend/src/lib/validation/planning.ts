import { z } from 'zod';
import { activityTypes } from './templates';

const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

export const timeSlotSchema = z
  .object({
    startTime: z.string().regex(timeRegex, 'Format horaire invalide (HH:MM)'),
    endTime: z.string().regex(timeRegex, 'Format horaire invalide (HH:MM)'),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "L'heure de fin doit être après l'heure de début",
    path: ['endTime'],
  });

export const createSlotWithActivitySchema = z
  .object({
    startTime: z.string().regex(timeRegex, 'Format horaire invalide (HH:MM)'),
    endTime: z.string().regex(timeRegex, 'Format horaire invalide (HH:MM)'),
    slotDate: z.string().optional().or(z.literal('')),
    activityType: z.enum(activityTypes).default('break'),
    nom: z.string().max(100).optional().or(z.literal('')),
    templateId: z.string().optional().or(z.literal('')),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "L'heure de fin doit être après l'heure de début",
    path: ['endTime'],
  });

export const renameActivitySchema = z.object({
  activityId: z.string().min(1),
  nom: z.string().trim().min(1, 'Le nom est requis').max(100),
});

export const changeActivityTypeSchema = z.object({
  activityId: z.string().min(1),
  activityType: z.enum(activityTypes),
});

export const updateActivitySchema = z.object({
  activityId: z.string().min(1),
  nom: z.string().trim().min(1, 'Le nom est requis').max(100),
  activityType: z.enum(activityTypes),
  description: z.string().optional().or(z.literal('')),
  difficulte: z.string().optional().or(z.literal('')),
  link: z
    .url("Le format du lien n'est pas valide (https://...)")
    .optional()
    .or(z.literal('')),
  content: z.string().optional().or(z.literal('')),
});

export const assignActivitySchema = z.object({
  timeSlotId: z.string().min(1),
  nom: z.string().trim().min(1, 'Le nom est requis').max(100),
  activityType: z.enum(activityTypes),
  description: z.string().optional().or(z.literal('')),
  difficulte: z.string().optional().or(z.literal('')),
  link: z
    .url("Le format du lien n'est pas valide (https://...)")
    .optional()
    .or(z.literal('')),
  content: z.string().optional().or(z.literal('')),
  templateId: z.string().optional().or(z.literal('')),
});

export type TimeSlotForm = z.infer<typeof timeSlotSchema>;
export type CreateSlotWithActivityForm = z.infer<
  typeof createSlotWithActivitySchema
>;
export type RenameActivityForm = z.infer<typeof renameActivitySchema>;
export type ChangeActivityTypeForm = z.infer<typeof changeActivityTypeSchema>;
export type UpdateActivityForm = z.infer<typeof updateActivitySchema>;
export type AssignActivityForm = z.infer<typeof assignActivitySchema>;
