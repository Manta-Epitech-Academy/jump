import type { RequestEvent } from '@sveltejs/kit';
import type { PlanningView } from '$lib/domain/talentPlanning';

/**
 * Dev-tooling: lets an admin impersonating a talent cycle the dashboard's
 * "Planning à venir" widget through every state without seeding events. It is
 * the talent-portal twin of the dev space's stage phase override
 * (`devPhaseOverride.ts`) and follows the same defense-in-depth shape:
 *
 *   1. Stored in a cookie, read once per request in `hooks.server.ts` and
 *      exposed via `locals.planningPreview`.
 *   2. Honored ONLY when the active session is an impersonated talent session
 *      (an admin is behind it). A real talent's own session never qualifies,
 *      so a stale cookie from a prior impersonation can't leak the preview into
 *      a student's real dashboard.
 *
 * Unlike the dev override (which substitutes a derived *status enum* and lets
 * the page recompute from real rows), this substitutes the whole
 * {@link PlanningView}: the widget has no underlying truth to recompute from
 * once we're faking the planning state, so we hand it a finished view-model.
 */

export const TALENT_PLANNING_PREVIEW_COOKIE = 'talent_planning_preview';

/**
 * The four previewable states. `active_stage`/`active_club` both land on the
 * widget's "ongoing" branch but differ in the event name shown (Stage de Seconde
 * vs Coding Club), the two variants the PR screenshots call out, so they're
 * distinct options. `upcoming` and `none` map 1:1 to their branches.
 */
const PLANNING_PREVIEW_VALUES = [
  'active_stage',
  'active_club',
  'upcoming',
  'none',
] as const;

export type PlanningPreview = (typeof PLANNING_PREVIEW_VALUES)[number];

export function isPlanningPreview(value: string): value is PlanningPreview {
  return (PLANNING_PREVIEW_VALUES as readonly string[]).includes(value);
}

/**
 * True when an admin is impersonating a talent. Gates both writing the cookie
 * (the endpoint) and honoring it (the reader below), and drives whether the
 * preview toggle renders in the talent impersonation banner.
 */
export function isTalentImpersonation(locals: App.Locals): boolean {
  const session = locals.session as { impersonatedBy?: string | null } | null;
  return Boolean(session?.impersonatedBy) && Boolean(locals.talent);
}

export function readPlanningPreview(
  event: RequestEvent,
): PlanningPreview | null {
  if (!isTalentImpersonation(event.locals)) return null;
  const raw = event.cookies.get(TALENT_PLANNING_PREVIEW_COOKIE);
  if (!raw || !isPlanningPreview(raw)) return null;
  return raw;
}

/** Days ahead the previewed "upcoming" session is placed, so the date copy reads naturally. */
const PREVIEW_UPCOMING_LEAD_DAYS = 8;

/**
 * Build the view-model a chosen preview should render. Self-contained: it
 * fabricates only the fields {@link PlanningView} carries, never a Prisma row.
 */
export function buildPreviewPlanningView(
  preview: PlanningPreview,
): PlanningView {
  switch (preview) {
    case 'active_stage':
      return {
        state: 'ongoing',
        titre: 'Stage de Seconde',
        publicName: null,
      };
    case 'active_club':
      return {
        state: 'ongoing',
        titre: 'Coding Club',
        publicName: null,
      };
    case 'upcoming': {
      const date = new Date();
      date.setDate(date.getDate() + PREVIEW_UPCOMING_LEAD_DAYS);
      return {
        state: 'upcoming',
        titre: 'Coding Club',
        publicName: null,
        // A confirmed time (14:00) so the "à HH:MM" line is exercised too.
        startMinutes: 14 * 60,
        date,
      };
    }
    case 'none':
      return { state: 'none' };
  }
}
