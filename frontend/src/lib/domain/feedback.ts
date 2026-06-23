/**
 * Slug of the canonical "Bilan du stage" form. The dev Bilan page, its QR, and
 * the admin redirect all resolve the form by this slug, so keep it single-sourced
 * here rather than re-typing the literal at each call site.
 */
export const STAGE_FORM_SLUG = 'stage';

/**
 * Returns the slug of the first dashboard-nudge form the talent still owes for the
 * event, or null. The candidate forms come from the DB (`Feedback_Form.dashboardNudge`),
 * so adding a nudged form needs no code change.
 *
 * Timing is staff-controlled, not deadline-driven: the card is shown from the event
 * start onward, and the precise relance window is the `dashboardNudge` toggle itself
 * (turned on when staff ask the cohort to fill it IRL, e.g. the Thursday/Friday of
 * the week, and off/archived when done). `existingFormIds` are the form ids already
 * submitted for the event; nudge forms are compared by id, and the URL uses the slug.
 */
export function pendingFeedbackForm(
  eventStart: Date,
  now: Date,
  nudgeForms: { id: string; slug: string }[],
  existingFormIds: string[],
): { formId: string } | null {
  if (now < eventStart) return null;
  const pending = nudgeForms.find((f) => !existingFormIds.includes(f.id));
  return pending ? { formId: pending.slug } : null;
}
