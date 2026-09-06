import type { User, Session } from '$lib/server/auth';
import type { StaffProfile, Talent, Campus, StaffRole } from '@prisma/client';
import type { StaffGroup } from '$lib/domain/permissions';
import type { EventLifecycleStatus } from '$lib/domain/eventLifecycle';
import type { PlanningPreview } from '$lib/server/talentPlanningPreview';

declare global {
  namespace App {
    interface Error {
      message: string;
      code?: 'staff_group_required';
      group?: StaffGroup;
    }
    interface Locals {
      user: User | null;
      session: Session | null;
      staffProfile: (StaffProfile & { campus: Campus | null }) | null;
      talent: Talent | null;
      /**
       * Campus name for the current talent, derived from their most recent
       * participation (talents have no direct Campus relation). Null for staff
       * (use `staffProfile.campus.name`) and anonymous requests. Resolved in
       * hooks.server.ts.
       */
      talentCampusName: string | null;
      /**
       * Campus id for the current talent, from the same resolve that produces
       * `talentCampusName` (so it costs no extra query). Null for staff (use
       * `staffProfile.campusId`) and anonymous requests. Usage recording needs
       * the id rather than the name: the name is display, the id is what a
       * per-campus figure groups on.
       */
      talentCampusId: string | null;
      /**
       * Dev-tooling override of the perceived stage phase. Only set when
       * an admin is impersonating a dev/superdev *and* on a /staff/dev
       * path. Lets developers preview phase-specific UI without mutating
       * event dates. See {@link readDevPhaseOverride}.
       */
      stagePhaseOverride: EventLifecycleStatus | null;
      /**
       * Dev-tooling preview of the talent dashboard "Planning à venir" widget.
       * Only set when an admin is impersonating a talent. Lets staff cycle the
       * widget through its states (event en cours / prochaine session / rien)
       * without seeding events. See {@link readPlanningPreview}.
       */
      planningPreview: PlanningPreview | null;
      /**
       * The real admin behind an impersonated session. Set only when
       * `session.impersonatedBy` is present. Lets analytics identify the
       * actual actor (the admin) rather than the impersonated profile,
       * so admin debugging/support clicks don't pollute the target
       * user's funnels.
       */
      impersonator: {
        userId: string;
        email: string | null;
        staffProfileId: string | null;
        staffRole: StaffRole | null;
        campusName: string | null;
        /** The impersonator's own dev-redirect lists (see StaffProfile). */
        devRedirectEmails: string[];
        devRedirectPhones: string[];
      } | null;
      /**
       * Whether the current user has armed "real sends" on a trapped env (see
       * `$lib/server/armRealSends`). Drives the global red banner; the trap
       * itself reads it via the request context.
       */
      armedRealSends: boolean;
      /** When the current arm auto-disarms, or null if not armed. */
      armedRealSendsUntil: Date | null;
      /**
       * An armed dev-redirect pin for a logged-out request (see
       * `$lib/server/devRedirectPin`): routes trapped login (OTP) mail to the
       * pinned admin so they can test the real logged-out login flow. Drives
       * the global amber banner; `to` is the predicted destination, `until` the
       * auto-clear deadline. Null when no valid pin is present.
       */
      devRedirectPin: { until: Date; to: string[] } | null;
    }
    // interface PageData {}
    // interface Platform {}
  }
}

export {};
