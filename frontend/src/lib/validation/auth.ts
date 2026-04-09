import { z } from 'zod';
import { m } from '$lib/paraglide/messages.js';

export const adminLoginSchema = z.object({
  email: z.email({ error: () => m.validation_email_invalid() }),
  password: z
    .string()
    .min(1, { error: () => m.validation_password_required() }),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const camperEmailSchema = z.object({
  email: z.email({ error: () => m.validation_email_invalid() }),
});

export const camperOtpSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .regex(/^\d+$/, { error: () => m.validation_otp_numeric() })
    .length(6, { error: () => m.validation_otp_length() }),
});

export type CamperEmailInput = z.infer<typeof camperEmailSchema>;
export type CamperOtpInput = z.infer<typeof camperOtpSchema>;
