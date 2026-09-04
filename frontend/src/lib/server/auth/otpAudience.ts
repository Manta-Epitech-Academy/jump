import { prisma } from '$lib/server/db';
import { BAUTH_STAFF_ROLES } from '$lib/domain/staff';

/**
 * Who is allowed to hold a login OTP, and what Jump knows about them.
 *
 * Email OTP is the talent and legal-guardian door; staff go through Microsoft
 * OAuth, which is where the `@epitech.eu` tenant restriction and the tenant's
 * MFA policy live. This function is the single spelling of that split, read by
 * three places that used to answer it separately, or not at all:
 *
 *   - `emailOtpAudienceGate`, the BetterAuth hook that guards every
 *     `/email-otp/*` route and `/sign-in/email-otp`,
 *   - `otpSession`, which mints and consumes OTPs server-side (the endpoints it
 *     calls carry no path, so the hook cannot see them),
 *   - the `/login` page action, which needs the same answer to pick its copy
 *     and its French 404.
 *
 * **A positive allowlist, and staff-deny comes first.** Two orderings were
 * wrong before and both are worth stating. Reading `bauth_user.role` alone
 * misses a profile whose role drifted: `staffAdminService` moves
 * `StaffProfile.staffRole` and `bauth_user.role` together, so they agree only
 * as long as every writer remembers to. And asking "does this row have a
 * Talent" first, as the login action did, admits a row that has BOTH a
 * `StaffProfile` and a `Talent` - the shape bad Salesforce data produces, and
 * the one `ensureTalentUser` refuses to create for exactly this reason.
 *
 * Not to be confused with `isParentOrStaffEmail` in `./emailIdentity`, which
 * answers a different question ("may a student's login identity be moved onto
 * this address") and therefore refuses guardians too.
 */
export type OtpIdentity =
  | { audience: 'talent'; talentId: string; name: string | null }
  | { audience: 'parent'; name: string | null };

export async function resolveOtpIdentity(
  email: string,
): Promise<OtpIdentity | null> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return null;

  const user = await prisma.bauth_user.findUnique({
    where: { email: normalized },
    select: {
      role: true,
      name: true,
      staffProfile: { select: { id: true } },
      talent: { select: { id: true } },
    },
  });
  if (!user) return null;

  if (user.staffProfile || BAUTH_STAFF_ROLES.includes(user.role)) return null;

  if (user.role === 'parent') return { audience: 'parent', name: user.name };
  if (user.talent) {
    return { audience: 'talent', talentId: user.talent.id, name: user.name };
  }
  return null;
}
