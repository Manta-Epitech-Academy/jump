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

  /**
   * What a departure must NOT take with it.
   *
   * `Closing_Record` and `AdminFile` cascaded from `StaffProfile`, so deleting an
   * account destroyed every closing that person had conducted and every file
   * they had put in the shared library. Nothing said so, and on the production
   * snapshot all 83 people who had conducted a closing were exposed - 1694
   * records, one click each.
   */
  it('leaves the closings they conducted and the files they uploaded standing', async () => {
    const leaver = await prisma.bauth_user.create({
      data: { email: `leaver.${stamp}@epitech.eu`, role: 'user' },
    });
    const profile = await prisma.staffProfile.create({
      data: { userId: leaver.id, staffRole: 'dev', campusId },
    });

    const template = await prisma.closing_Template.create({
      data: { key: `leaver-grid-${stamp}`, label: 'Grille test' },
    });
    const event = await prisma.event.create({
      data: {
        titre: `Leaver ${stamp}`,
        date: new Date('2026-04-01T00:00:00.000Z'),
        campusId,
      },
    });
    const talent = await prisma.talent.create({
      data: { nom: 'Leaver', prenom: `Test${stamp}` },
    });
    const closing = await prisma.closing_Record.create({
      data: {
        talentId: talent.id,
        eventId: event.id,
        campusId,
        staffId: profile.id,
        templateId: template.id,
        status: 'done',
        recommendation: 'bon_profil',
      },
    });
    const file = await prisma.adminFile.create({
      data: {
        name: 'plaquette.pdf',
        s3Key: `admin/leaver-${stamp}.pdf`,
        contentType: 'application/pdf',
        size: 1024,
        uploadedById: profile.id,
      },
    });

    expect((await deleteStaffUser(leaver.id)).ok).toBe(true);

    const survivingClosing = await prisma.closing_Record.findUnique({
      where: { id: closing.id },
    });
    expect(survivingClosing).not.toBeNull();
    // The record stays, the attribution goes: the screens render a former
    // member rather than losing the conversation.
    expect(survivingClosing!.staffId).toBeNull();
    expect(survivingClosing!.recommendation).toBe('bon_profil');

    const survivingFile = await prisma.adminFile.findUnique({
      where: { id: file.id },
    });
    expect(survivingFile).not.toBeNull();
    expect(survivingFile!.uploadedById).toBeNull();

    await prisma.closing_Record.delete({ where: { id: closing.id } });
    await prisma.adminFile.delete({ where: { id: file.id } });
    await prisma.talent.delete({ where: { id: talent.id } });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.closing_Template.delete({ where: { id: template.id } });
  });

  /**
   * The other half, which failed in the opposite direction: `Broadcast`,
   * `MessageTemplate` and `CmsPage` defaulted to RESTRICT, so a member who had
   * ever sent a campaign simply could not be deleted, and the page said only
   * "Erreur lors de la suppression du membre".
   */
  it('deletes a member who has already sent a campaign', async () => {
    const sender = await prisma.bauth_user.create({
      data: { email: `sender.${stamp}@epitech.eu`, role: 'user' },
    });
    await prisma.staffProfile.create({
      data: { userId: sender.id, staffRole: 'dev', campusId },
    });

    const template = await prisma.messageTemplate.create({
      data: {
        name: `Relance ${stamp}`,
        channel: 'mail',
        body: 'Bonjour {prenom}',
        createdById: sender.id,
      },
    });
    const broadcast = await prisma.broadcast.create({
      data: {
        name: `Campagne ${stamp}`,
        channel: 'mail',
        templateId: template.id,
        campusId,
        audience: 'talent',
        bodySnapshot: 'Bonjour {prenom}',
        createdById: sender.id,
      },
    });

    expect((await deleteStaffUser(sender.id)).ok).toBe(true);

    // The send is a fact: it happened, so it outlives the account that
    // triggered it, carrying no creator rather than blocking the deletion.
    const survivingBroadcast = await prisma.broadcast.findUnique({
      where: { id: broadcast.id },
    });
    expect(survivingBroadcast).not.toBeNull();
    expect(survivingBroadcast!.createdById).toBeNull();

    await prisma.broadcast.delete({ where: { id: broadcast.id } });
    await prisma.messageTemplate.delete({ where: { id: template.id } });
  });

  /**
   * The campus move, which stranded the columns `db/scoped.ts` cloisters on.
   * Postgres carries it now, through the composite foreign key on
   * `(eventId, campusId)`, so nobody has to remember to update the dependents.
   */
  it('carries a campus move down to the enrolments and closings of the event', async () => {
    const event = await prisma.event.create({
      data: {
        titre: `Moving ${stamp}`,
        date: new Date('2026-05-01T00:00:00.000Z'),
        campusId,
      },
    });
    const talent = await prisma.talent.create({
      data: { nom: 'Moving', prenom: `Test${stamp}` },
    });
    const participation = await prisma.participation.create({
      data: { talentId: talent.id, eventId: event.id, campusId },
    });

    await prisma.event.update({
      where: { id: event.id },
      data: { campusId: secondCampusId },
    });

    const moved = await prisma.participation.findUniqueOrThrow({
      where: { id: participation.id },
    });
    expect(moved.campusId).toBe(secondCampusId);

    await prisma.participation.delete({ where: { id: participation.id } });
    await prisma.talent.delete({ where: { id: talent.id } });
    await prisma.event.delete({ where: { id: event.id } });
  });

  /**
   * The two invariants the database now holds itself, rather than trusting the
   * one code path that writes them.
   */
  it('refuses a leadership token granted write access', async () => {
    const owner = await prisma.bauth_user.create({
      data: { email: `tokenowner.${stamp}@epitech.eu`, role: 'user' },
    });
    await expect(
      prisma.adminApi_Token.create({
        data: {
          staffUserId: owner.id,
          label: 'Sonde',
          tier: 'leadership',
          writeEnabled: true,
          tokenHash: `hash-${stamp}`,
        },
      }),
    ).rejects.toThrow();
    await prisma.bauth_user.delete({ where: { id: owner.id } });
  });

  it('refuses a usage row whose actor does not match its kind', async () => {
    const owner = await prisma.bauth_user.create({
      data: { email: `usageowner.${stamp}@epitech.eu`, role: 'user' },
    });
    const profile = await prisma.staffProfile.create({
      data: { userId: owner.id, staffRole: 'dev', campusId },
    });
    await expect(
      prisma.usage_FeatureUse.create({
        data: {
          feature: 'dev_dashboard_view',
          // A staff profile under a talent's kind would be a re-identification
          // of a minor, which is the one thing this table exists to prevent.
          actorKind: 'talent',
          staffProfileId: profile.id,
        },
      }),
    ).rejects.toThrow();
    await prisma.bauth_user.delete({ where: { id: owner.id } });
  });
});
