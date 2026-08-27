/**
 * Stable key of the recommendation question. It is the single most important
 * question, reusable across every feedback form, so the dev feedback page
 * promotes it to a roster column + filter + the lone chart. A form opts in
 * simply by giving its recommendation question this key; forms without it just
 * show the response/no-response roster. Single-sourced here rather than
 * re-typing the `'reco'` literal at each site.
 */
export const RECO_QUESTION_KEY = 'reco';

/**
 * Staff-facing heading for the recommendation chart on the dashboards (dev
 * feedback page, admin responses). Deliberately decoupled from the question's
 * own `prompt`: the actual wording is talent-phrased and editable per form, but
 * staff scanning the verdict want one stable heading that reads the same across
 * every form.
 */
export const RECO_VERDICT_LABEL = 'Recommandation';

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
 * Public (unauthenticated) shareable path for a form, opened by anyone with the
 * link (parents, families, an event's audience). Deliberately short and
 * channel-neutral (`/f/<slug>`) so it reads right for any form, not just a stage
 * bilan. The legacy `/bilan/<slug>` path 301-redirects here, so existing QR
 * codes and shared links keep working. Callers prepend `${ORIGIN}${base}` for an
 * absolute URL.
 */
export function publicFormPath(slug: string): string {
  return `/f/${slug}`;
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
