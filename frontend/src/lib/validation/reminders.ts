import { z } from 'zod';
import { RELANCE_SMS_BODY_MAX } from '$lib/domain/relance';

export const RELANCE_SUBJECT_MAX = 200;
export const RELANCE_BODY_MAX = 5000;

export const sendRelanceSchema = z
  .object({
    talentIds: z
      .union([z.string().min(1), z.array(z.string().min(1))])
      .transform((v) => (Array.isArray(v) ? v : [v])),
    type: z.enum(['student', 'parent']),
    channel: z.enum(['email', 'sms']).default('email'),
    // Optional at the schema level: SMS carries no subject. The refinement
    // below makes it required for email so we don't ship a subject-less mail.
    subject: z.string().max(RELANCE_SUBJECT_MAX).default(''),
    body: z.string().min(1).max(RELANCE_BODY_MAX),
  })
  .refine((d) => d.channel !== 'email' || d.subject.trim().length >= 1, {
    message: 'Objet requis pour un email.',
    path: ['subject'],
  })
  .refine((d) => d.channel !== 'sms' || d.body.length <= RELANCE_SMS_BODY_MAX, {
    message: `Le SMS ne peut pas dépasser ${RELANCE_SMS_BODY_MAX} caractères.`,
    path: ['body'],
  });

export type SendRelanceInput = z.infer<typeof sendRelanceSchema>;
