/**
 * Whether opening an activity lands the talent on a detail page worth visiting.
 *
 * The calendar summary dialog already shows an activity's name, schedule, type,
 * difficulty and description inline. The detail page (route `/[activityId]`)
 * only earns a visit when it can show *more* than that summary:
 *   - a static activity with a written `content` body or an external `link`;
 *   - a dynamic activity with an actual content source to render steps from
 *     (a GitHub-backed subject version, or an inline `contentStructure`).
 *
 * A bare activity (only a title on a time slot, the shape we get when a campus
 * hands us a schedule with no content) is NOT openable. Callers use this to:
 *   - drop the dead "Accéder à l'activité" button from the summary dialog, and
 *   - redirect the detail route instead of rendering a blank page.
 *
 * Single source of truth so the dialog's button and the route guard can't drift.
 */
export type OpenableActivity = {
  isDynamic: boolean;
  content?: string | null;
  link?: string | null;
  subjectVersionId?: string | null;
  contentStructure?: unknown;
};

const hasText = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

const hasSteps = (structure: unknown): boolean =>
  !!structure &&
  typeof structure === 'object' &&
  Array.isArray((structure as { steps?: unknown }).steps) &&
  (structure as { steps: unknown[] }).steps.length > 0;

export function isActivityOpenable(activity: OpenableActivity): boolean {
  if (activity.isDynamic) {
    return (
      hasText(activity.subjectVersionId) || hasSteps(activity.contentStructure)
    );
  }
  return hasText(activity.content) || hasText(activity.link);
}
