import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import {
  inviteStaff,
  cancelInvitation,
  cancelInvitations,
  updateStaffCampus,
  updateStaffRole,
  deleteStaffUser,
} from '../staffAdminService';

/**
 * The role change is the reason this service exists: it moves two rows
 * (`StaffProfile.staffRole` and `bauth_user.role`) that must never disagree, and
 * a route file is not a place that can be tested.
 */
describe('staffAdminService (integration)', () => {
  const stamp = Date.now();
  const memberEmail = `dev.${stamp}@epitech.eu`;
  const inviteEmail = `invite.${stamp}@epitech.eu`;
  let campusId = '';
  let secondCampusId = '';
  let memberUserId = '';
  let inviterUserId = '';

  beforeAll(async () => {
    assertTestDatabase();
    const [campus, second] = await Promise.all([
      prisma.campus.create({
        data: {
          name: `Test Campus ${stamp}`,
          externalName: `TEST_CAMPUS_${stamp}`,
        },
      }),
      prisma.campus.create({
        data: {
          name: `Test Campus 2 ${stamp}`,
          externalName: `TEST_CAMPUS2_${stamp}`,
        },
      }),
    ]);
    campusId = campus.id;
    secondCampusId = second.id;

    const [member, inviter] = await Promise.all([
      prisma.bauth_user.create({
        data: { email: memberEmail, name: 'Dev Test', role: 'user' },
      }),
      prisma.bauth_user.create({
        data: {
          email: `admin.${stamp}@epitech.eu`,
          name: 'Admin Test',
          role: 'admin',
        },
      }),
    ]);
    memberUserId = member.id;
    inviterUserId = inviter.id;

    await prisma.staffProfile.create({
      data: { userId: memberUserId, staffRole: 'dev', campusId },
    });
  });

  afterAll(async () => {
    try {
      await prisma.staffInvitation.deleteMany({
        where: { email: { contains: `${stamp}` } },
      });
      await prisma.bauth_user.deleteMany({
        where: { id: { in: [memberUserId, inviterUserId] } },
      });
      await prisma.campus.deleteMany({
        where: { id: { in: [campusId, secondCampusId] } },
      });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('moves both the staff profile and the auth role in one transaction', async () => {
    const result = await updateStaffRole(memberUserId, 'superdev');
    expect(result.ok).toBe(true);

    const [profile, user] = await Promise.all([
      prisma.staffProfile.findUnique({ where: { userId: memberUserId } }),
      prisma.bauth_user.findUnique({ where: { id: memberUserId } }),
    ]);
    expect(profile?.staffRole).toBe('superdev');
    // `bauthRoleForStaffRole` maps every staff role onto BetterAuth's cached
    // role, so the session gate agrees with the profile.
    expect(user?.role).not.toBe('user');
  });

  it('clears the campus when promoting to admin, since an admin has none', async () => {
    await updateStaffCampus(memberUserId, campusId);
    expect(
      (
        await prisma.staffProfile.findUnique({
          where: { userId: memberUserId },
        })
      )?.campusId,
    ).toBe(campusId);

    const result = await updateStaffRole(memberUserId, 'admin');
    expect(result.ok).toBe(true);
    expect(
      (
        await prisma.staffProfile.findUnique({
          where: { userId: memberUserId },
        })
      )?.campusId,
    ).toBeNull();
  });

  it('refuses to attach a campus to an admin, and leaves the row untouched', async () => {
    const result = await updateStaffCampus(memberUserId, secondCampusId);
    expect(result).toEqual({ ok: false, reason: 'admin_has_no_campus' });
    expect(
      (
        await prisma.staffProfile.findUnique({
          where: { userId: memberUserId },
        })
      )?.campusId,
    ).toBeNull();
  });

  it('rejects a role that is not one of ours without writing anything', async () => {
    const before = await prisma.staffProfile.findUnique({
      where: { userId: memberUserId },
    });
    const result = await updateStaffRole(memberUserId, 'pedago');
    expect(result).toEqual({ ok: false, reason: 'invalid_role' });
    const after = await prisma.staffProfile.findUnique({
      where: { userId: memberUserId },
    });
    expect(after?.staffRole).toBe(before?.staffRole);
  });

  it('invites once, then refuses a duplicate invitation and an existing staff address', async () => {
    const first = await inviteStaff({
      email: inviteEmail.toUpperCase(),
      campusId,
      staffRole: 'dev',
      invitedByUserId: inviterUserId,
    });
    expect(first.ok).toBe(true);

    // Stored lower-case, so the address is one identity whatever the casing.
    const invitation = await prisma.staffInvitation.findUnique({
      where: { email: inviteEmail },
    });
    expect(invitation?.campusId).toBe(campusId);

    const duplicate = await inviteStaff({
      email: inviteEmail,
      campusId,
      staffRole: 'dev',
      invitedByUserId: inviterUserId,
    });
    expect(duplicate).toEqual({ ok: false, reason: 'invitation_exists' });

    const alreadyStaff = await inviteStaff({
      email: memberEmail,
      campusId,
      staffRole: 'dev',
      invitedByUserId: inviterUserId,
    });
    expect(alreadyStaff).toEqual({ ok: false, reason: 'staff_exists' });
  });

  it('drops the campus on an admin invitation', async () => {
    const email = `adminvite.${stamp}@epitech.eu`;
    const result = await inviteStaff({
      email,
      campusId,
      staffRole: 'admin',
      invitedByUserId: inviterUserId,
    });
    expect(result.ok).toBe(true);
    expect(
      (await prisma.staffInvitation.findUnique({ where: { email } }))?.campusId,
    ).toBeNull();
  });

  it('cancels one invitation and a selected batch', async () => {
    const solo = await prisma.staffInvitation.create({
      data: {
        email: `solo.${stamp}@epitech.eu`,
        staffRole: 'dev',
        campusId,
        invitedByUserId: inviterUserId,
      },
    });
    expect((await cancelInvitation(solo.id)).ok).toBe(true);
    expect(
      await prisma.staffInvitation.findUnique({ where: { id: solo.id } }),
    ).toBeNull();

    const batch = await Promise.all(
      ['a', 'b'].map((k) =>
        prisma.staffInvitation.create({
          data: {
            email: `batch.${k}.${stamp}@epitech.eu`,
            staffRole: 'dev',
            campusId,
            invitedByUserId: inviterUserId,
          },
        }),
      ),
    );
    const result = await cancelInvitations(batch.map((b) => b.id));
    expect(result).toEqual({ ok: true, count: 2 });
  });

  it('deletes a staff account and its profile with it', async () => {
    const doomed = await prisma.bauth_user.create({
      data: { email: `doomed.${stamp}@epitech.eu`, role: 'user' },
    });
    await prisma.staffProfile.create({
      data: { userId: doomed.id, staffRole: 'dev', campusId },
    });

    expect((await deleteStaffUser(doomed.id)).ok).toBe(true);
    expect(
      await prisma.staffProfile.findUnique({ where: { userId: doomed.id } }),
    ).toBeNull();
  });
});
