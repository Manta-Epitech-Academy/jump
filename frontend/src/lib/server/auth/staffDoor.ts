import type { BetterAuthOptions } from 'better-auth';
import { prisma } from '$lib/server/db';
import { isStaffEmailAddress } from '$lib/domain/staff';

/**
 * Why the staff Microsoft door turns someone away. Each value is also the
 * `?error=` code `/staff/login` answers in French: BetterAuth carries a refusal
 * from `validateUserInfo` there through `onAPIError.errorURL`.
 */
export type StaffDoorRefusal =
  'UnauthorizedDomain' | 'NotStaffAccount' | 'NotInvited';

/**
 * Whether the staff Microsoft door lets this identity through, decided before
 * BetterAuth writes anything.
 *
 * It is wired as `user.validateUserInfo` in `server/auth.ts`, which BetterAuth
 * calls ahead of each of its three writes: creating a `bauth_user`, linking a
 * Microsoft account onto an existing one (by matching address, or through
 * `/link-social`), and signing in on an account already linked. The decision
 * used to live in `staff/oauth/callback`, a page BetterAuth redirects to after
 * it has created or linked the row and set the session cookie, and only because
 * the client names that page as its `callbackURL`. Naming any other page skipped
 * it and kept the session and the link (security audit run-1). Deciding first
 * also means a refusal has nothing to undo: no row to release, none to delete.
 *
 * `userId` is the existing row BetterAuth found, absent when it is about to
 * create one; `email` is the address the provider asserts now, so a member whose
 * tenant address moved out of `@epitech.eu` is refused on their next sign-in.
 *
 * The door opens only onto a member of staff's row or onto nobody's:
 *
 * 1. Outside `@epitech.eu`, nobody.
 * 2. A row whose `StaffProfile` carries a role is staff: admitted.
 * 3. A row carrying a `Talent` or `role: 'parent'` is somebody else's login. It
 *    is refused even when an invitation names its address, which is what a
 *    Salesforce contact holding a staff address produces: turning it into staff
 *    would lock the talent or the guardian out of the OTP door, so the clash is
 *    for a human to resolve. The link test BetterAuth runs before this one does
 *    not protect them, since every guardian and every talent who has signed in
 *    passes it (`.claude/rules/auth.md`).
 * 4. Otherwise an invitation for the address admits, and its absence refuses.
 *    That covers a first sign-in, a row provisioned by a script, and a member
 *    whose role was withdrawn (a profile with no role, nothing pending).
 *
 * Provisioning the profile from the invitation stays in `staff/oauth/callback`:
 * someone admitted here who skips it holds a session they were allowed to have,
 * with nothing staff-capable in it.
 */
export async function staffDoorRefusal(
  email: string | undefined,
  userId: string | undefined,
): Promise<StaffDoorRefusal | null> {
  if (!email || !isStaffEmailAddress(email)) return 'UnauthorizedDomain';

  if (userId) {
    const user = await prisma.bauth_user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        talent: { select: { id: true } },
        staffProfile: { select: { staffRole: true } },
      },
    });
    if (user?.staffProfile?.staffRole) return null;
    if (user?.talent || user?.role === 'parent') return 'NotStaffAccount';
  }

  const invitation = await prisma.staffInvitation.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });
  return invitation ? null : 'NotInvited';
}

type ValidateUserInfo = NonNullable<
  NonNullable<BetterAuthOptions['user']>['validateUserInfo']
>;

/**
 * `staffDoorRefusal` as BetterAuth asks it. Every other way in (the OTP door,
 * the admin plugin) passes untouched: they have doors of their own.
 */
export const staffDoorGate: ValidateUserInfo = async ({ user, source }) => {
  if (source.method !== 'oauth' || source.oauth?.providerId !== 'microsoft') {
    return;
  }
  const refusal = await staffDoorRefusal(user.email, user.id);
  return refusal ? { error: refusal } : undefined;
};
