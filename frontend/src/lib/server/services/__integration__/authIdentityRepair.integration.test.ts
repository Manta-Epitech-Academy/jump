import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { runAuthRepair } from '$lib/server/services/authIdentityRepairService';
import { loadOpenSyncErrors } from '$lib/server/services/syncErrorQueue';
import { assertTestDatabase } from './testDatabase';

/**
 * The sync-errors page and the Connexion tab of Divergences Salesforce speak
 * about the same address conflicts, so they have to agree on two things: the
 * page sends an admin to the tab only for a case the tab repairs, and a repair
 * made there closes the errors it fixed, and only those.
 *
 * Each talent here has a login on one address while Salesforce gives it
 * another, which an account already holds: the state the sync records as an
 * `ADDRESS_TAKEN` error. The errors are written directly, as the sync's last
 * pass would have left them.
 */
describe('auth repairs and the sync errors they answer (integration)', () => {
  const stamp = Date.now();
  const mail = (name: string) => `${name}-${stamp}@repair.test`;
  const talentIds: string[] = [];
  const userIds: string[] = [];

  const account = async (email: string) => {
    const { id } = await prisma.bauth_user.create({
      data: { email, role: 'student' },
    });
    userIds.push(id);
    return id;
  };

  /** A talent logging in on `login` while Salesforce gives it `sfEmail`. */
  const drifted = async (prenom: string, login: string, sfEmail: string) => {
    const { id } = await prisma.talent.create({
      data: {
        externalId: `repair-${prenom}-${stamp}`,
        prenom,
        nom: 'Réparation',
        userId: await account(login),
        sfImport: { create: { prenom, nom: 'Réparation', sfEmail } },
      },
    });
    talentIds.push(id);
    await prisma.sync_Error.create({
      data: { kind: 'ADDRESS_TAKEN', talentId: id },
    });
    return id;
  };

  const errorOf = (talentId: string) =>
    prisma.sync_Error.findUnique({ where: { talentId } });

  const queued = async (talentId: string) =>
    (await loadOpenSyncErrors()).find((e) => e.subject.talentId === talentId);

  beforeAll(() => {
    assertTestDatabase();
  });

  afterAll(async () => {
    await prisma.authIdentityRepair.deleteMany({
      where: { talentId: { in: talentIds } },
    });
    // The talents' errors and mirrors go with them (cascade).
    await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
    await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('switches a talent onto the orphan account and closes its error', async () => {
    await account(mail('orphan'));
    const talent = await drifted('Orphée', mail('orphee-old'), mail('orphan'));

    expect((await queued(talent))?.situation).toMatchObject({
      holder: { kind: 'orphan' },
      repair: 'repointDrop',
    });

    await runAuthRepair('repointDrop', talent, 'test');
    expect(await errorOf(talent)).toBeNull();
  });

  it('swaps a symmetric inversion and closes both errors', async () => {
    const alice = await drifted('Alice', mail('bruno'), mail('alice'));
    const bruno = await drifted('Bruno', mail('alice'), mail('bruno'));

    expect((await queued(alice))?.explanation.remedy).toMatchObject({
      who: 'jump',
      text: expect.stringMatching(/Échanger les deux comptes/),
    });

    await runAuthRepair('swap', alice, 'test');
    expect(await errorOf(alice)).toBeNull();
    expect(await errorOf(bruno)).toBeNull();
  });

  // The tab lists a degraded inversion without a repair (« À escalader »), so
  // the page must not send anyone there for it.
  it('sends a degraded inversion to Salesforce, and a sever leaves its error open', async () => {
    const chloe = await drifted('Chloé', mail('chloe-old'), mail('denis'));
    await drifted('Denis', mail('denis'), mail('denis-own'));

    const open = await queued(chloe);
    expect(open?.situation).toMatchObject({
      holder: { kind: 'talent', sameName: false },
      repair: null,
    });
    expect(open?.explanation.remedy.who).toBe('salesforce');

    // A sever only stops an exposure: the talent is left without a login, so
    // what its error says is still true.
    await runAuthRepair('sever', chloe, 'test');
    expect(await errorOf(chloe)).not.toBeNull();
  });
});
