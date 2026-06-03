import { z } from 'zod';
import {
  BROADCAST_AUDIENCES,
  BROADCAST_CHANNELS,
  IMAGE_RIGHTS_FILTER_OPTIONS,
  JUMP_LEVELS,
} from '$lib/domain/broadcasts';
import {
  SMS_BROADCAST_MAX_CHARS,
  SMS_MAX_SEGMENTS,
  estimateSmsLength,
  smsSegments,
} from '$lib/domain/sms';
import { NIVEAUX } from '$lib/domain/niveau';

const tristate = z.enum(['yes', 'no', 'any']);

export const broadcastFiltersSchema = z
  .object({
    niveau: z.array(z.enum(NIVEAUX)).optional(),
    charterSigned: tristate.optional(),
    rulesSigned: tristate.optional(),
    parentRulesSigned: tristate.optional(),
    onboardingDone: tristate.optional(),
    imageRights: z.array(z.enum(IMAGE_RIGHTS_FILTER_OPTIONS)).optional(),
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
      if (estimated > SMS_BROADCAST_MAX_CHARS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Message trop long : ${SMS_MAX_SEGMENTS} SMS maximum (~${SMS_BROADCAST_MAX_CHARS} caractères, liens compris ; ici ~${estimated} = ${smsSegments(estimated)} SMS). Raccourcissez le texte.`,
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

// Structural shape of the broadcast composer form, shared by the page load,
// the `testSend` action (template-only — no audience/campus needed) and the
// `enqueue` action. `campusId` and `audience` are required to *enqueue* but
// not structurally: that rule lives in the enqueue action so test-send and
// the live preview can reuse this schema without being blocked by it. The
// broadcast name is generated server-side at enqueue time, so it isn't a
// field here.
export const broadcastSchema = z
  .object({
    templateId: z.string().min(1, 'Sélectionne un template'),
    campusId: z.string().optional().or(z.literal('')),
    audience: z
      .enum(BROADCAST_AUDIENCES, { message: 'Audience invalide' })
      .optional(),
    eventId: z.string().optional().or(z.literal('')),
    sourceBroadcastId: z.string().optional().or(z.literal('')),
    sourceFilter: broadcastSourceFilterSchema.optional(),
    filters: broadcastFiltersSchema.optional(),
    // Per-send content, seeded from the picked template but editable for this
    // send only. The Broadcast snapshots whatever lands here (the template is
    // never mutated). Structurally optional so the live preview / test-send can
    // reuse this schema; the enqueue action enforces non-empty body + a subject
    // for mail, plus the SMS length ceiling.
    subject: z
      .string()
      .max(200, 'Le sujet ne peut pas dépasser 200 caractères')
      .optional()
      .or(z.literal('')),
    body: z.string().optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
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
