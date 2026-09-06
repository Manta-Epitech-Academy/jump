import { z } from 'zod';

/**
 * Personal dev-redirect lists, edited by admins in the settings dialog. The textareas take
 * one entry per line (commas tolerated); the action splits, validates and
 * normalizes them into the `StaffProfile.devRedirect{Emails,Phones}` arrays.
 * Kept as raw strings in the schema so the form round-trips exactly what the
 * user typed when validation fails.
 */
export const staffDevRedirectSchema = z.object({
  devRedirectEmails: z.string().trim().default(''),
  devRedirectPhones: z.string().trim().default(''),
});

/** Split a textarea value into trimmed, non-empty entries (newline or comma). */
export function splitDevRedirectEntries(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
