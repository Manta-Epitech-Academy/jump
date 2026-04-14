import { z } from 'zod';
import { activityTypes } from './templates';

const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

export const planningTemplateSchema = z.object({
  nom: z
    .string()
    .min(3, 'Le nom doit faire au moins 3 caractères')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères'),
  description: z.string().optional().or(z.literal('')),
  nbDays: z.preprocess(
    (val) => (typeof val === 'string' ? Number(val) : val),
    z
      .number({ message: 'Veuillez entrer un nombre' })
      .int()
      .min(1, 'Au moins 1 jour')
      .max(30, 'Maximum 30 jours'),
  ),
});

export const planningTemplateDaySchema = z.object({
  dayId: z.string().min(1),
  label: z
    .string()
    .max(100, 'Le label ne peut pas dépasser 100 caractères')
    .optional()
    .or(z.literal('')),
});

export const planningTemplateSlotSchema = z
  .object({
    planningTemplateDayId: z.string().min(1),
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

export const planningTemplateSlotItemSchema = z.object({
  planningTemplateSlotId: z.string().min(1),
  activityTemplateId: z.string().optional().or(z.literal('')),
  nom: z.string().max(100).optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  activityType: z.enum(activityTypes).optional(),
});

export const applyPlanningTemplateSchema = z.object({
  planningTemplateId: z.string().min(1, 'Veuillez sélectionner un modèle'),
});

export type PlanningTemplateForm = z.infer<typeof planningTemplateSchema>;
export type PlanningTemplateDayForm = z.infer<typeof planningTemplateDaySchema>;
export type PlanningTemplateSlotForm = z.infer<
  typeof planningTemplateSlotSchema
>;
export type PlanningTemplateSlotItemForm = z.infer<
  typeof planningTemplateSlotItemSchema
>;
export type ApplyPlanningTemplateForm = z.infer<
  typeof applyPlanningTemplateSchema
>;
