import { fromDate } from '@internationalized/date';
import type { Answers } from './feedbackForms/schema';

/**
 * Find the first Friday >= eventStart (in the campus timezone), set the time
 * to 17:00 in that timezone, and return as a UTC Date.
 * For week 2, add 7 days to that Friday first.
 */
export function feedbackFridayDeadline(
  eventStart: Date,
  week: 1 | 2,
  timezone: string,
): Date {
  const zoned = fromDate(eventStart, timezone);
  // Wall-clock day of week using JS Date (month is 0-indexed)
  const wallDate = new Date(zoned.year, zoned.month - 1, zoned.day);
  const dow = wallDate.getDay(); // 0 = Sun, 5 = Fri
  const daysToFriday = (5 - dow + 7) % 7;
  const weekOffset = week === 2 ? 7 : 0;
  const daysToAdd = daysToFriday + weekOffset;

  const deadline = zoned
    .add({ days: daysToAdd })
    .set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
  return deadline.toDate();
}

/**
 * Return the list of form IDs whose deadline has passed but have not yet been
 * submitted (not in existingFormIds).
 */
export function pendingFeedbackForms(
  eventStart: Date,
  now: Date,
  timezone: string,
  existingFormIds: string[],
): Array<{ formId: string; week: 1 | 2 }> {
  const deadlineW1 = feedbackFridayDeadline(eventStart, 1, timezone);
  const deadlineW2 = feedbackFridayDeadline(eventStart, 2, timezone);

  const result: Array<{ formId: string; week: 1 | 2 }> = [];

  if (now >= deadlineW1 && !existingFormIds.includes('w1')) {
    result.push({ formId: 'w1', week: 1 });
  }
  if (now >= deadlineW2 && !existingFormIds.includes('w2')) {
    result.push({ formId: 'w2', week: 2 });
  }

  return result;
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
