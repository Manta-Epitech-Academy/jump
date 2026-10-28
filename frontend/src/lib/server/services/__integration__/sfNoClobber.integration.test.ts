import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { schoolYearOf } from '$lib/domain/schoolYear';
import type { WorkerTalent } from '$lib/validation/workerSync';
import { syncTalents } from '$lib/server/services/syncService';
import { loadOpenSyncErrors } from '$lib/server/services/syncErrorQueue';
import {
  adoptSalesforceField,
  listSalesforceDiffs,
} from '$lib/server/services/reconciliationService';
import { assertTestDatabase } from './testDatabase';

/**
 * "Salesforce never overwrites a field a talent confirmed", run through the
 * sync itself, and held against the conflict list admins arbitrate from.
 *
 * The rule once failed in production: every sync overwrote the phone and name a
 * talent had confirmed, and nothing records what a talent typed before it, so
 * a regression loses it for good. The sync and `listSalesforceDiffs` read the
 * rule from two sides (one refuses the write, the other shows what it refused),
 * so each case checks they agree.
 *
 * The schools are created resolved, so `resolveSchoolByUai` never calls the
 * annuaire: a UAI added to a payload here must be one of them.
 */
describe('the Salesforce sync keeps what a talent confirmed (integration)', () => {
  const stamp = Date.now();
  const uaiA = `NCA${stamp}`;
  const uaiB = `NCB${stamp}`;
  const parentEmail = `parent-${stamp}@noclobber.test`;
  const year = schoolYearOf(new Date(), 'Europe/Paris').label;
  const externalIds: string[] = [];
  let schoolA = '';
  let schoolB = '';
  let parentUserId = '';

  /** One Salesforce contact as the worker sends it, under a fresh id. */
  const sf = (name: string, over: Partial<WorkerTalent> = {}): WorkerTalent => {
    const external_id = `nc-${name}-${stamp}`;
    if (!externalIds.includes(external_id)) externalIds.push(external_id);
    return {
      external_id,
      first_name: 'Inès',
      last_name: 'Initiale',
      email: `${name}-${stamp}@noclobber.test`,
      phone: '0612345678',
      gender: 'f',
      class_level: '2nde',
      school_uai: uaiA,
      school: 'Lycée A',
      ...over,
    };
  };

  const talentOf = (externalId: string) =>
    prisma.talent.findUniqueOrThrow({
      where: { externalId },
      select: {
        id: true,
        nom: true,
        prenom: true,
        phone: true,
        civilite: true,
        niveau: true,
        schoolId: true,
        user: { select: { email: true } },
        sfImport: true,
        schoolingRecords: { where: { schoolYear: year } },
      },
    });

  const diffsOf = async (talentId: string) =>
    (
      (await listSalesforceDiffs()).find((t) => t.talentId === talentId)
        ?.diffs ?? []
    ).map((d) => [d.field, d.kind]);

  beforeAll(async () => {
    assertTestDatabase();
    schoolA = (
      await prisma.school.create({
        data: { uai: uaiA, name: 'Lycée A', resolvedAt: new Date() },
      })
    ).id;
    schoolB = (
      await prisma.school.create({
        data: { uai: uaiB, name: 'Lycée B', resolvedAt: new Date() },
      })
    ).id;
    parentUserId = (
      await prisma.bauth_user.create({
        data: { email: parentEmail, role: 'parent' },
      })
    ).id;
  });

  afterAll(async () => {
    const talents = await prisma.talent.findMany({
      where: { externalId: { in: externalIds } },
      select: { userId: true },
    });
    await prisma.talent.deleteMany({
      where: { externalId: { in: externalIds } },
    });
    const userIds = talents
      .map((t) => t.userId)
      .filter((id): id is string => !!id);
    await prisma.bauth_user.deleteMany({
      where: { id: { in: [...userIds, parentUserId] } },
    });
    // A talent's login errors went with it (cascade); a nameless contact's
    // carry its Salesforce id.
    await prisma.sync_Error.deleteMany({
      where: { externalId: { in: externalIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [schoolA, schoolB] } },
    });
  });

  it('follows Salesforce on an unconfirmed talent, school included', async () => {
    await syncTalents([sf('open')]);
    await syncTalents([
      sf('open', {
        last_name: 'Renommée',
        phone: '0698765432',
        gender: 'm',
        school_uai: uaiB,
        school: 'Lycée B',
      }),
    ]);

    const t = await talentOf(sf('open').external_id);
    expect(t).toMatchObject({
      nom: 'Renommée',
      phone: '+33698765432',
      civilite: 'homme',
      schoolId: schoolB,
    });
    expect(t.schoolingRecords[0]?.schoolId).toBe(schoolB);
    expect(t.sfImport).toMatchObject({ nom: 'Renommée', sfSchoolId: schoolB });
  });

  it('keeps confirmed identity fields, moves the mirror, and lists exactly those', async () => {
    await syncTalents([sf('info')]);
    const { id } = await talentOf(sf('info').external_id);
    await prisma.talent.update({
      where: { id },
      data: { infoValidatedAt: new Date() },
    });

    await syncTalents([
      sf('info', {
        last_name: 'Écrasée',
        phone: '0698765432',
        gender: 'm',
        class_level: '1ere',
      }),
    ]);

    const t = await talentOf(sf('info').external_id);
    expect(t).toMatchObject({
      nom: 'Initiale',
      phone: '+33612345678',
      civilite: 'femme',
      // Salesforce owns the level: no confirmation gates it.
      niveau: '1ere',
    });
    expect(t.sfImport).toMatchObject({
      nom: 'Écrasée',
      phone: '+33698765432',
      civilite: 'homme',
    });
    expect(await diffsOf(id)).toEqual([
      ['nom', 'conflict'],
      ['phone', 'conflict'],
      ['civilite', 'conflict'],
    ]);
  });

  it('keeps a confirmed school in the ledger while the mirror moves, and lists it', async () => {
    await syncTalents([sf('school')]);
    const { id } = await talentOf(sf('school').external_id);
    await prisma.talent.update({
      where: { id },
      data: { highSchoolValidatedAt: new Date() },
    });

    const moved = sf('school', { school_uai: uaiB, school: 'Lycée B' });
    await syncTalents([moved]);

    const t = await talentOf(moved.external_id);
    expect(t.schoolId).toBe(schoolA);
    expect(t.schoolingRecords[0]?.schoolId).toBe(schoolA);
    expect(t.sfImport?.sfSchoolId).toBe(schoolB);
    const [school] = (await listSalesforceDiffs()).find(
      (d) => d.talentId === id,
    )!.diffs;
    expect(school).toMatchObject({
      field: 'school',
      kind: 'conflict',
      jumpKey: uaiA,
      sfKey: uaiB,
    });

    // An admin adopting Salesforce's school closes the divergence, and the same
    // payload replayed then changes nothing.
    await adoptSalesforceField(id, 'school');
    expect((await talentOf(moved.external_id)).schoolId).toBe(schoolB);
    expect(await diffsOf(id)).toEqual([]);
    expect((await syncTalents([moved])).updated).toBe(0);
  });

  it('keeps the level when Salesforce sends none, or one Jump does not know', async () => {
    await syncTalents([sf('level')]);
    for (const class_level of ['', 'seconde']) {
      await syncTalents([sf('level', { class_level })]);
      const t = await talentOf(sf('level').external_id);
      expect(t.sfImport?.niveau).toBeNull();
      expect(t.niveau).toBe('2nde');
      expect(t.schoolingRecords[0]?.niveau).toBe('2nde');
    }
  });

  it('renames the login to the address Salesforce now claims', async () => {
    await syncTalents([sf('mail')]);
    const renamed = `renamed-${stamp}@noclobber.test`;
    await syncTalents([sf('mail', { email: renamed })]);

    const t = await talentOf(sf('mail').external_id);
    expect(t.user?.email).toBe(renamed);
    expect(await prisma.sync_Error.count({ where: { talentId: t.id } })).toBe(
      0,
    );
  });

  it("leaves the login alone on a parent's address, and logs the collision", async () => {
    await syncTalents([sf('parent')]);
    const before = (await talentOf(sf('parent').external_id)).user?.email;
    await syncTalents([sf('parent', { email: parentEmail })]);

    const t = await talentOf(sf('parent').external_id);
    expect(t.user?.email).toBe(before);
    expect(t.sfImport?.sfEmail).toBe(parentEmail);
    expect(
      await prisma.sync_Error.findUnique({
        where: { talentId: t.id },
        select: { kind: true },
      }),
    ).toEqual({ kind: 'ADDRESS_TAKEN' });
  });

  // A talent the sync sees for the first time with a parent's address gets no
  // login, and the error tells the admin where the fix is: in Salesforce, since
  // the Connexion tab only lists talents that already have one. Read through
  // the queue the admin page and the API share, which names the holder now.
  it("sends a new talent's address a parent holds back to Salesforce", async () => {
    const fresh = sf('newparent', { email: parentEmail });
    await syncTalents([fresh]);

    const t = await talentOf(fresh.external_id);
    expect(t.user).toBeNull();
    const open = (await loadOpenSyncErrors()).find(
      (e) => e.subject.talentId === t.id,
    );
    expect(open?.situation).toEqual({
      kind: 'ADDRESS_TAKEN',
      hasAccount: false,
      holder: { kind: 'parent' },
      repair: null,
    });
    expect(open?.explanation.consequence).toMatch(/ne peut pas se connecter/);
    expect(open?.explanation.remedy.who).toBe('salesforce');
  });

  it('closes the error once Salesforce gives the talent its own address', async () => {
    const own = `own-${stamp}@noclobber.test`;
    await syncTalents([sf('newparent', { email: own })]);

    const t = await talentOf(sf('newparent').external_id);
    expect(t.user?.email).toBe(own);
    expect(await prisma.sync_Error.count({ where: { talentId: t.id } })).toBe(
      0,
    );
  });
});
