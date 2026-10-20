import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import {
  ensureTalentUser,
  TalentAccountError,
} from '$lib/server/services/talentAccount';
import { assertTestDatabase } from './testDatabase';

/**
 * Why a talent cannot be given a login, as `ensureTalentUser` reports it. The
 * sync, the login page and impersonation all mint through it, and the two kinds
 * are different problems for the admin who reads the outcome: no Salesforce
 * address at all, or one that already belongs to somebody else.
 */
describe('minting a talent login (integration)', () => {
  const stamp = Date.now();
  const parentEmail = `identity-parent-${stamp}@identity.test`;
  const takenEmail = `identity-taken-${stamp}@identity.test`;
  const talentIds: string[] = [];
  const userIds: string[] = [];

  /** An accountless talent whose Salesforce mirror claims `sfEmail`. */
  async function accountless(name: string, sfEmail: string | null) {
    const talent = await prisma.talent.create({
      data: {
        prenom: 'Sacha',
        nom: name,
        sfImport: { create: { nom: name, prenom: 'Sacha', sfEmail } },
      },
    });
    talentIds.push(talent.id);
    return talent.id;
  }

  async function refusal(talentId: string) {
    const error = await ensureTalentUser(talentId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TalentAccountError);
    expect(
      (await prisma.talent.findUniqueOrThrow({ where: { id: talentId } }))
        .userId,
    ).toBeNull();
    return (error as TalentAccountError).kind;
  }

  beforeAll(async () => {
    assertTestDatabase();
    userIds.push(
      (
        await prisma.bauth_user.create({
          data: { email: parentEmail, role: 'parent' },
        })
      ).id,
    );
    const holder = await prisma.bauth_user.create({
      data: { email: takenEmail, role: 'student' },
    });
    userIds.push(holder.id);
    talentIds.push(
      (
        await prisma.talent.create({
          data: {
            prenom: 'Déjà',
            nom: 'Lié',
            externalId: `identity-holder-${stamp}`,
            userId: holder.id,
          },
        })
      ).id,
    );
  });

  afterAll(async () => {
    await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
    await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('says a talent without a Salesforce address has no email', async () => {
    expect(await refusal(await accountless('Sansadresse', null))).toBe(
      'no_email',
    );
  });

  it("calls a parent's address an identity conflict", async () => {
    expect(await refusal(await accountless('Parentale', parentEmail))).toBe(
      'identity_conflict',
    );
  });

  it("calls another talent's address an identity conflict", async () => {
    expect(await refusal(await accountless('Doublon', takenEmail))).toBe(
      'identity_conflict',
    );
  });
});
