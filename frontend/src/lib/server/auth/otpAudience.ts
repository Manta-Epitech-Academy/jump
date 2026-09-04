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

/**
 * Why an address may or may not use the OTP door.
 *
 * `refused` and `unknown` both mean "no OTP for this address", which is all
 * three of the callers above need, so they read {@link resolveOtpIdentity}
 * instead. The gate is the one caller that has to tell them apart: it makes a
 * refused address indistinguishable from an unknown one by handing BetterAuth
 * an address BetterAuth has never seen, and it can only do that for an address
 * that is actually refused. Answering an unknown address itself would put our
 * response where the plugin's own belongs.
 */
export type OtpDoor =
  | { verdict: 'allowed'; identity: OtpIdentity }
  | { verdict: 'refused' }
  | { verdict: 'unknown' };

export async function resolveOtpDoor(email: string): Promise<OtpDoor> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return { verdict: 'unknown' };

  const user = await prisma.bauth_user.findUnique({
    where: { email: normalized },
    select: {
      role: true,
      name: true,
      staffProfile: { select: { id: true } },
      talent: { select: { id: true } },
    },
  });
  if (!user) return { verdict: 'unknown' };

  if (user.staffProfile || BAUTH_STAFF_ROLES.includes(user.role)) {
    return { verdict: 'refused' };
  }

  if (user.role === 'parent') {
    return {
      verdict: 'allowed',
      identity: { audience: 'parent', name: user.name },
    };
  }
  if (user.talent) {
    return {
      verdict: 'allowed',
      identity: {
        audience: 'talent',
        talentId: user.talent.id,
        name: user.name,
      },
    };
  }
  // A login with neither a Talent nor a guardian role: nothing this door can
  // sign in, even though the row exists.
  return { verdict: 'refused' };
}

export async function resolveOtpIdentity(
  email: string,
): Promise<OtpIdentity | null> {
  const door = await resolveOtpDoor(email);
  return door.verdict === 'allowed' ? door.identity : null;
}
