import { z } from 'zod';
import {
  BROADCAST_AUDIENCES,
  BROADCAST_CHANNELS,
  JUMP_LEVELS,
  SMS_MAX_LENGTH,
  estimateSmsLength,
} from '$lib/domain/broadcasts';
import { NIVEAUX } from '$lib/domain/niveau';

const tristate = z.enum(['yes', 'no', 'any']);

export const broadcastFiltersSchema = z
  .object({
    niveau: z.array(z.enum(NIVEAUX)).optional(),
    charterSigned: tristate.optional(),
    imageRightsSigned: tristate.optional(),
    jumpLevel: z.array(z.enum(JUMP_LEVELS)).optional(),
    hasPastEvent: tristate.optional(),
    hasFutureEvent: tristate.optional(),
  })
  .strict();

export type BroadcastFiltersForm = z.infer<typeof broadcastFiltersSchema>;

export const messageTemplateSchema = z
  .object({
    name: z
      .string()
      .min(3, 'Le nom doit faire au moins 3 caractères')
      .max(100, 'Le nom ne peut pas dépasser 100 caractères'),
    channel: z.enum(BROADCAST_CHANNELS, {
      message: 'Canal invalide',
    }),
    subject: z
      .string()
      .max(200, 'Le sujet ne peut pas dépasser 200 caractères')
      .optional()
      .or(z.literal('')),
    body: z.string().min(1, 'Le corps ne peut pas être vide'),
  })
  .superRefine((data, ctx) => {
    if (
      data.channel === 'mail' &&
      (!data.subject || data.subject.trim() === '')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le sujet est obligatoire pour un mail',
        path: ['subject'],
      });
    }
    if (data.channel === 'sms') {
      const estimated = estimateSmsLength(data.body);
      if (estimated > SMS_MAX_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Le SMS dépasse ${SMS_MAX_LENGTH} caractères une fois les liens trackés (estimation : ${estimated})`,
          path: ['body'],
        });
      }
    }
  });

export type MessageTemplateForm = z.infer<typeof messageTemplateSchema>;

export const broadcastSourceFilterSchema = z.enum([
  'opened',
  'not_opened',
  'all',
]);

export const broadcastSchema = z
  .object({
    // Auto-generated server-side as `[DD/MM/YYYY HH:MM] Campus - Template`.
    // Kept on the schema for the loaded form snapshot, but optional so the
    // client can leave it empty.
    name: z
      .string()
      .max(160, 'Le nom ne peut pas dépasser 160 caractères')
      .optional()
      .default(''),
    templateId: z.string().min(1, 'Sélectionne un template'),
    campusId: z.string().min(1, 'Sélectionne un campus'),
    // Optional at the schema level so the form can render with nothing
    // pre-selected; the superRefine below enforces selection at submit.
    audience: z
      .enum(BROADCAST_AUDIENCES, { message: 'Audience invalide' })
      .optional(),
    eventId: z.string().optional().or(z.literal('')),
    sourceBroadcastId: z.string().optional().or(z.literal('')),
    sourceFilter: broadcastSourceFilterSchema.optional(),
    filters: broadcastFiltersSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.audience) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Sélectionne une audience',
        path: ['audience'],
      });
    }
    if (data.sourceBroadcastId && !data.sourceFilter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Sélectionne un filtre (ouvert / non ouvert / tous) pour l'envoi source",
        path: ['sourceFilter'],
      });
    }
  });

export type BroadcastForm = z.infer<typeof broadcastSchema>;

export const testSendSchema = z.object({
  templateId: z.string().min(1),
  eventId: z.string().optional().or(z.literal('')),
  recipientEmail: z.email('Email invalide').optional().or(z.literal('')),
  recipientPhone: z.string().optional().or(z.literal('')),
});

export type TestSendForm = z.infer<typeof testSendSchema>;
