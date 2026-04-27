import type { User, Session } from '$lib/server/auth';
import type { StaffProfile, Talent, Campus } from '@prisma/client';
import type { FlagKey } from '$lib/domain/featureFlags';
import type { StaffGroup } from '$lib/domain/permissions';

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
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
