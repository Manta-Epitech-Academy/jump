import { z } from 'zod';
import { difficultes } from '$lib/domain/xp';
import { activityTypes } from './templates';

const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

export const timeSlotSchema = z
  .object({
    startTime: z.string().regex(timeRegex, 'Format horaire invalide (HH:MM)'),
    endTime: z.string().regex(timeRegex, 'Format horaire invalide (HH:MM)'),
    label: z
      .string()
      .max(100, 'Le label ne peut pas dépasser 100 caractères')
      .optional()
      .or(z.literal('')),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "L'heure de fin doit être après l'heure de début",
    path: ['endTime'],
  });

export const createActivityFromTemplateSchema = z.object({
  templateId: z.string().min(1, 'Veuillez sélectionner un template'),
  timeSlotId: z.string().min(1),
});

export const createStaticActivitySchema = z.object({
  nom: z
    .string()
    .min(3, 'Le nom doit faire au moins 3 caractères')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères'),
  description: z.string().optional().or(z.literal('')),
  difficulte: z
    .enum(difficultes, {
      message: 'Veuillez sélectionner une difficulté valide',
    })
    .optional()
    .or(z.literal('')),
  activityType: z.enum(activityTypes, {
    message: "Veuillez sélectionner un type d'activité",
  }),
  content: z.string().min(1, 'Le contenu markdown est requis'),
  link: z
    .url("Le format du lien n'est pas valide (https://...)")
    .optional()
    .or(z.literal('')),
  timeSlotId: z.string().min(1),
});

export type TimeSlotForm = z.infer<typeof timeSlotSchema>;
export type CreateActivityFromTemplateForm = z.infer<
  typeof createActivityFromTemplateSchema
>;
export type CreateStaticActivityForm = z.infer<
  typeof createStaticActivitySchema
>;
