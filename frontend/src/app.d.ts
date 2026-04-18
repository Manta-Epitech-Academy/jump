import type { User, Session } from '$lib/server/auth';
import type { StaffProfile, Talent, Campus } from '@prisma/client';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user: User | null;
      session: Session | null;
      staffProfile: (StaffProfile & { campus: Campus | null }) | null;
      talent: Talent | null;
      viewMode: 'readonly' | 'edit';
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
