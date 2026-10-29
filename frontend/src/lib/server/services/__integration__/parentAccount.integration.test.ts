import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { changeParentEmail, setParentLogin } from '../parentAccount';
import { ensureTalentUser } from '../talentAccount';

/**
 * Parent 1's address and login move together through `setParentLogin`, from the
 * wizard's parents step and from the admin correction alike. Security audit
 * run-1 found the two writers disagreeing: the wizard minted a verified parent
 * login for every address a talent ever typed and left each one behind, and
 * renamed nothing it did not own but rewrote the name of any parent login it
 * reached; the admin correction renamed the old login onto the new address,
 * sessions included.
 */
describe('parent 1 login (integration)', () => {
  const stamp = Date.now();
  const address = (label: string) => `${label}.${stamp}@example.test`;
  const talentIds: string[] = [];

  async function makeTalent(parentEmail: string | null = null) {
    const talent = await prisma.talent.create({
      data: {
        nom: 'Test',
        prenom: 'Talent',
        parentEmail,
        parentPrenom: 'Marie',
        parentNom: 'Dupont',
      },
    });
    talentIds.push(talent.id);
    return talent.id;
  }

  const setLogin = (talentId: string, email: string, name = 'Marie Dupont') =>
    prisma.$transaction((tx) => setParentLogin(tx, talentId, { email, name }));

  const loginAt = (email: string) =>
    prisma.bauth_user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        name: true,
        emailVerified: true,
        sessions: { select: { id: true } },
      },
    });

  beforeAll(() => {
    assertTestDatabase();
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
      await prisma.bauth_user.deleteMany({
        where: { email: { endsWith: `.${stamp}@example.test` } },
      });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('mints a verified parent login, refreshes its name, and refuses an address held by another role', async () => {
    const talentId = await makeTalent();
    const parentEmail = address('parent');

    expect(await setLogin(talentId, parentEmail)).toEqual({
      ok: true,
      changed: true,
    });
    const created = await loginAt(parentEmail);
    expect(created).toMatchObject({
      role: 'parent',
      emailVerified: true,
      name: 'Marie Dupont',
    });

    expect(
      await setLogin(talentId, parentEmail, 'Marie-Claire Dupont'),
    ).toEqual({ ok: true, changed: false });
    expect((await loginAt(parentEmail))?.name).toBe('Marie-Claire Dupont');

    // One email, one account, one role: a student's address never hosts a
    // parent login, and nothing is written on the refusal.
    const studentEmail = address('student');
    await prisma.bauth_user.create({
      data: { email: studentEmail, role: 'student' },
    });
    expect(await setLogin(talentId, studentEmail)).toEqual({
      ok: false,
      reason: 'email_taken',
    });
    expect(
      (await prisma.talent.findUnique({ where: { id: talentId } }))
        ?.parentEmail,
    ).toBe(parentEmail);
  });

  it('refuses a staff address before a staff login exists there', async () => {
    // A member invited but not yet signed in has no login, so "held by another
    // role" cannot catch it: a parent login minted there is one the staff door
    // then refuses to turn into staff, locking the member out on a talent's
    // typing.
    const talentId = await makeTalent();
    const invitee = `invitee.${stamp}@epitech.eu`;

    expect(await setLogin(talentId, invitee)).toEqual({
      ok: false,
      reason: 'staff_address',
    });
    expect(await loginAt(invitee)).toBeNull();
    expect(
      (await prisma.talent.findUnique({ where: { id: talentId } }))
        ?.parentEmail,
    ).toBeNull();
  });

  it('leaves no parent login behind an address the talent moved away from', async () => {
    const talentId = await makeTalent();
    const squatted = address('future-student');
    await setLogin(talentId, squatted);
    await setLogin(talentId, address('real-parent'));

    expect(await loginAt(squatted)).toBeNull();

    // The address was a student's before Salesforce sent them: their login
    // can now be minted instead of failing on a parent login nobody points at.
    const student = await prisma.talent.create({
      data: {
        nom: 'Futur',
        prenom: 'Talent',
        sfImport: { create: { sfEmail: squatted } },
      },
    });
    talentIds.push(student.id);
    const userId = await ensureTalentUser(student.id);
    expect(
      (await prisma.bauth_user.findUnique({ where: { id: userId } }))?.role,
    ).toBe('student');
  });

  it("never rewrites the name of another family's parent login", async () => {
    const shared = address('shared-parent');
    const family = await makeTalent();
    await setLogin(family, shared, 'Marie Dupont');

    const other = await makeTalent();
    expect(
      await setLogin(other, shared, 'Usurpé [x](https://evil.test)'),
    ).toEqual({ ok: true, changed: true });
    expect((await loginAt(shared))?.name).toBe('Marie Dupont');

    // Not on a re-submit either, while the first family still points at it.
    await setLogin(other, shared, 'Encore usurpé');
    expect((await loginAt(shared))?.name).toBe('Marie Dupont');
  });

  it('keeps a login a sibling still points at when one talent moves away', async () => {
    const shared = address('sibling-parent');
    const elder = await makeTalent();
    const younger = await makeTalent();
    await setLogin(elder, shared);
    await setLogin(younger, shared);

    await setLogin(younger, address('other-parent'));

    expect(await loginAt(shared)).not.toBeNull();
  });

  it('ends the previous holder session when an admin corrects the address', async () => {
    // A typo put the welcome link in a stranger's mailbox, and they opened it.
    const typo = address('typo');
    const talentId = await makeTalent(typo);
    await setLogin(talentId, typo);
    const stranger = await loginAt(typo);
    await prisma.bauth_session.create({
      data: {
        userId: stranger!.id,
        token: `typo-session-${stamp}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const corrected = address('corrected');
    expect(await changeParentEmail(talentId, corrected)).toMatchObject({
      ok: true,
      changed: true,
    });

    expect(await loginAt(typo)).toBeNull();
    expect(
      await prisma.bauth_session.count({
        where: { token: `typo-session-${stamp}` },
      }),
    ).toBe(0);
    const guardian = await loginAt(corrected);
    expect(guardian?.id).not.toBe(stranger!.id);
    expect(guardian?.sessions).toEqual([]);
  });

  it('mints the login an unchanged address is missing', async () => {
    const parentEmail = address('never-provisioned');
    const talentId = await makeTalent(parentEmail);

    expect(await setLogin(talentId, parentEmail)).toEqual({
      ok: true,
      changed: false,
    });
    expect((await loginAt(parentEmail))?.role).toBe('parent');
  });
});
