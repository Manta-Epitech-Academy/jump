/**
 * Staff roster operations behind the admin members page: invitations, campus
 * assignment, role changes, account removal.
 *
 * The page action stays guard + validation + service call + form state; every
 * multi-model or transactional write lives here. Services return a tagged
 * result instead of `fail()` / `message()` so the French copy and the HTTP
 * status stay in the route (the only layer that knows it is serving a form),
 * and a second caller (a job, a curated API operation) can reuse the same
 * write without inheriting Superforms.
 *
 * Self-target refusals ("you can't change your own role") are NOT here: they
 * depend on the acting session, which is a route concern.
 */

import { Prisma, type StaffRole } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { staffRoles, bauthRoleForStaffRole } from '$lib/domain/staff';
import type { ServiceResult } from './result';

export type InviteStaffFailure =
  'staff_exists' | 'invitation_exists' | 'unknown';

/**
 * Create a pending staff invitation. Invitations are pending by construction:
 * the OAuth callback deletes the row on first sign-in.
 *
 * An admin invitation carries no campus (an admin is campus-agnostic), which is
 * why `campusId` is dropped for that role rather than validated against one.
 */
export async function inviteStaff(input: {
  email: string;
  campusId: string;
  staffRole: StaffRole;
  invitedByUserId: string;
}): Promise<ServiceResult<InviteStaffFailure>> {
  const email = input.email.toLowerCase();

  const [existingStaff, existingInvite] = await Promise.all([
    prisma.staffProfile.findFirst({ where: { user: { email } } }),
    prisma.staffInvitation.findUnique({ where: { email } }),
  ]);

  if (existingStaff) return { ok: false, reason: 'staff_exists' };
  if (existingInvite) return { ok: false, reason: 'invitation_exists' };

  try {
    await prisma.staffInvitation.create({
      data: {
        email,
        campusId: input.staffRole === 'admin' ? null : input.campusId,
        staffRole: input.staffRole,
        invitedByUserId: input.invitedByUserId,
      },
    });
    return { ok: true };
  } catch (err) {
    // Lost the race against a concurrent invite for the same address: the
    // unique index is the real gate, the pre-check above is just the fast path.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return { ok: false, reason: 'invitation_exists' };
    }
    console.error('[staffAdmin] inviteStaff failed:', err);
    return { ok: false, reason: 'unknown' };
  }
}

export async function cancelInvitation(
  id: string,
): Promise<ServiceResult<'unknown'>> {
  try {
    await prisma.staffInvitation.delete({ where: { id } });
    return { ok: true };
  } catch (err) {
    console.error('[staffAdmin] cancelInvitation failed:', err);
    return { ok: false, reason: 'unknown' };
  }
}

/**
 * Bulk-cancel selected pending invitations, clearing a stale backlog in one
 * shot rather than one delete per row.
 */
export async function cancelInvitations(
  ids: string[],
): Promise<ServiceResult<'unknown', { count: number }>> {
  try {
    const { count } = await prisma.staffInvitation.deleteMany({
      where: { id: { in: ids } },
    });
    return { ok: true, count };
  } catch (err) {
    console.error('[staffAdmin] cancelInvitations failed:', err);
    return { ok: false, reason: 'unknown' };
  }
}

/**
 * Move a staff member to a campus (or detach them with `null`).
 * Refuses on admins: that role is campus-agnostic by design, so a campus on an
 * admin profile would assert a scope the space does not have.
 */
export async function updateStaffCampus(
  userId: string,
  campusId: string | null,
): Promise<ServiceResult<'admin_has_no_campus' | 'unknown'>> {
  const existing = await prisma.staffProfile.findUnique({
    where: { userId },
    select: { staffRole: true },
  });
  if (existing?.staffRole === 'admin') {
    return { ok: false, reason: 'admin_has_no_campus' };
  }

  try {
    await prisma.staffProfile.upsert({
      where: { userId },
      update: { campusId: campusId || null },
      create: { userId, campusId: campusId || null },
    });
    return { ok: true };
  } catch (err) {
    console.error('[staffAdmin] updateStaffCampus failed:', err);
    return { ok: false, reason: 'unknown' };
  }
}

/** Narrow a submitted role string to the enum, `null` meaning "no role". */
function parseStaffRole(raw: string): StaffRole | null | 'invalid' {
  if (!raw) return null;
  return (staffRoles as readonly string[]).includes(raw)
    ? (raw as StaffRole)
    : 'invalid';
}

/**
 * Change a staff member's role.
 *
 * Two rows carry the role and both must move together: `StaffProfile.staffRole`
 * (what Jump gates on) and `bauth_user.role` (what BetterAuth caches on the
 * session). A half-applied change leaves someone gated as their old role until
 * their next login, hence the transaction.
 *
 * Promoting to `admin` also clears the campus, mirroring `updateStaffCampus`:
 * the two writes can't disagree about whether an admin has one.
 */
export async function updateStaffRole(
  userId: string,
  rawRole: string,
): Promise<ServiceResult<'invalid_role' | 'unknown'>> {
  const parsed = parseStaffRole(rawRole);
  if (parsed === 'invalid') return { ok: false, reason: 'invalid_role' };

  try {
    await prisma.$transaction([
      prisma.staffProfile.upsert({
        where: { userId },
        update: {
          staffRole: parsed,
          ...(parsed === 'admin' ? { campusId: null } : {}),
        },
        create: { userId, staffRole: parsed },
      }),
      prisma.bauth_user.update({
        where: { id: userId },
        data: { role: bauthRoleForStaffRole(parsed) },
      }),
    ]);
    return { ok: true };
  } catch (err) {
    console.error('[staffAdmin] updateStaffRole failed:', err);
    return { ok: false, reason: 'unknown' };
  }
}

/** Delete a staff account. Cascades to their profile and sessions. */
export async function deleteStaffUser(
  userId: string,
): Promise<ServiceResult<'unknown'>> {
  try {
    await prisma.bauth_user.delete({ where: { id: userId } });
    return { ok: true };
  } catch (err) {
    console.error('[staffAdmin] deleteStaffUser failed:', err);
    return { ok: false, reason: 'unknown' };
  }
}
