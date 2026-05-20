import type { User, Session } from '$lib/server/auth';
import type { StaffProfile, Talent, Campus, StaffRole } from '@prisma/client';
import type { FlagKey } from '$lib/domain/featureFlags';
import type { StaffGroup } from '$lib/domain/permissions';
import type { EventLifecycleStatus } from '$lib/domain/eventLifecycle';

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
      viewMode: 'readonly' | 'edit';
      featureFlags: Set<FlagKey>;
      ticketsEnabled: boolean;
      /**
       * Dev-tooling override of the perceived stage phase. Only set when
       * an admin is impersonating a dev/superdev *and* on a /staff/dev
       * path. Lets developers preview phase-specific UI without mutating
       * event dates. See {@link readDevPhaseOverride}.
       */
      stagePhaseOverride: EventLifecycleStatus | null;
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
      } | null;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
