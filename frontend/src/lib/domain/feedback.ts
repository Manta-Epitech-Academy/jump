/**
 * Slug of the canonical "Bilan du stage" form. The dev Bilan page, its QR, and
 * the admin redirect all resolve the form by this slug, so keep it single-sourced
 * here rather than re-typing the literal at each call site.
 */
export const STAGE_FORM_SLUG = 'stage';

/**
 * Stable key of the recommendation question ("recommanderais-tu ce stage ?").
 * It is the single most important question, reused across every feedback form,
 * so the dev Bilan promotes it to a roster column + filter + the lone chart.
 * Single-sourced here rather than re-typing the `'reco'` literal at each site.
 */
export const RECO_QUESTION_KEY = 'reco';

/**
 * Staff-facing label for the recommendation chart on the dashboards (dev Bilan,
 * admin responses). Deliberately decoupled from the question's own `prompt`: the
 * actual wording is talent-phrased ("recommanderais-tu ce stage ?") and can be
 * re-edited per form, but staff scanning the verdict want one stable heading that
 * reads the same across every form. Vouvoiement, since staff read it.
 */
export const RECO_VERDICT_LABEL =
  'Est-ce que vous recommanderiez le stage à Epitech ?';

/**
 * Route path (base- and origin-less) a talent opens to answer a form for an
 * event: the authenticated bilan link. Single-sourced so the projected QR image
 * and the shareable URL shown beside it always target the exact same route, even
 * if it is later renamed. Callers prepend `${ORIGIN}${base}` for an absolute URL.
 */
export function feedbackFormPath(eventId: string, formSlug: string): string {
  return `/feedback/${eventId}/${formSlug}`;
}

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
