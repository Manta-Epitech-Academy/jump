import { fromDate } from '@internationalized/date';
import type { Answers } from './feedbackForms/schema';

/** The single feedback form ID for stage de seconde. */
export const STAGE_FORM_ID = 'stage';

/**
 * Deadline for stage feedback: second Friday >= eventStart at 17:00 (campus tz).
 * This covers the full two-week stage period.
 */
export function feedbackDeadline(eventStart: Date, timezone: string): Date {
  const zoned = fromDate(eventStart, timezone);
  const wallDate = new Date(zoned.year, zoned.month - 1, zoned.day);
  const dow = wallDate.getDay();
  const daysToFriday = (5 - dow + 7) % 7;
  // Second Friday (end of stage)
  const daysToAdd = daysToFriday + 7;

  const deadline = zoned
    .add({ days: daysToAdd })
    .set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
  return deadline.toDate();
}

/**
 * Returns the form ID if the deadline has passed and the talent hasn't submitted yet.
 */
export function pendingFeedbackForm(
  eventStart: Date,
  now: Date,
  timezone: string,
  existingFormIds: string[],
): { formId: string } | null {
  const deadline = feedbackDeadline(eventStart, timezone);
  if (now >= deadline && !existingFormIds.includes(STAGE_FORM_ID)) {
    return { formId: STAGE_FORM_ID };
  }
  return null;
}

/**
 * Build a prefill map from talent identity fields to form question IDs.
 * Only non-null values are included.
 */
export function buildPrefill(
  talent: {
    prenom: string | null;
    nom: string | null;
    email: string | null;
    phone: string | null;
    civilite?: string | null;
  },
  campusName: string,
): Answers {
  const prefill: Answers = {};

  prefill['campus'] = campusName;

  if (talent.civilite != null) {
    prefill['civilite'] = talent.civilite;
  }
  if (talent.nom != null) {
    prefill['nom'] = talent.nom;
  }
  if (talent.prenom != null) {
    prefill['prenom'] = talent.prenom;
  }
  if (talent.phone != null) {
    prefill['telephone'] = talent.phone;
  }
  if (talent.email != null) {
    prefill['mail'] = talent.email;
  }

  return prefill;
}
