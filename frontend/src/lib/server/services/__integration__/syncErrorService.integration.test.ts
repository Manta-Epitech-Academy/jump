import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import {
  rebindTalentExtId,
  resolveSyncError,
  resolveAllSyncErrors,
  resolveSyncErrors,
} from '../syncErrorService';

/**
 * Rebinding is identity surgery on a real student's row (their Salesforce
 * externalId), so each refusal branch matters as much as the happy path: a wrong
 * rebind silently attaches one human's history to another.
 */
describe('syncErrorService (integration)', () => {
  const stamp = Date.now();
  const deadExtId = `test_dead_${stamp}`;
  const freshExtId = `test_fresh_${stamp}`;
  const otherExtId = `test_other_${stamp}`;
  let campusId = '';
  const createdTalentIds: string[] = [];
  const createdErrorIds: string[] = [];

  const makeError = async (over: {
    existingExtId?: string | null;
    attemptedExtId: string;
  }) => {
    const row = await prisma.syncError.create({
      data: {
        errorType: 'extid_conflict',
        email: `conflict.${stamp}.${Math.random().toString(36).slice(2, 8)}@example.test`,
        attemptedExtId: over.attemptedExtId,
        existingExtId: over.existingExtId ?? null,
        talentName: 'Test Conflict',
        message: 'Salesforce regenerated the extId',
      },
    });
    createdErrorIds.push(row.id);
    return row;
  };

  const makeTalent = async (externalId: string) => {
    const talent = await prisma.talent.create({
      data: { externalId, nom: 'Test', prenom: 'Talent' },
    });
    createdTalentIds.push(talent.id);
    return talent;
  };

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: {
        name: `Test Campus ${stamp}`,
        externalName: `TEST_CAMPUS_${stamp}`,
      },
    });
    campusId = campus.id;
  });

  afterAll(async () => {
    try {
      await prisma.syncError.deleteMany({
        where: { id: { in: createdErrorIds } },
      });
      await prisma.talent.deleteMany({
        where: { id: { in: createdTalentIds } },
      });
      if (campusId) {
        await prisma.campus.delete({ where: { id: campusId } }).catch(() => {});
      }
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('repoints the talent onto the new extId and resolves the row', async () => {
    const talent = await makeTalent(deadExtId);
    const error = await makeError({
      existingExtId: deadExtId,
      attemptedExtId: freshExtId,
    });

    const result = await rebindTalentExtId(error.id);
    expect(result.ok).toBe(true);

    const [after, row] = await Promise.all([
      prisma.talent.findUnique({ where: { id: talent.id } }),
      prisma.syncError.findUnique({ where: { id: error.id } }),
    ]);
    expect(after?.externalId).toBe(freshExtId);
    expect(row?.resolved).toBe(true);
    expect(row?.resolvedAt).not.toBeNull();
  });

  it('refuses when the new extId already belongs to another talent, touching nothing', async () => {
    const keeper = await makeTalent(`test_keeper_${stamp}`);
    const other = await makeTalent(otherExtId);
    const error = await makeError({
      existingExtId: keeper.externalId!,
      attemptedExtId: otherExtId,
    });

    const result = await rebindTalentExtId(error.id);
    expect(result).toEqual({ ok: false, reason: 'ext_id_taken' });

    const [keeperAfter, otherAfter, row] = await Promise.all([
      prisma.talent.findUnique({ where: { id: keeper.id } }),
      prisma.talent.findUnique({ where: { id: other.id } }),
      prisma.syncError.findUnique({ where: { id: error.id } }),
    ]);
    expect(keeperAfter?.externalId).toBe(keeper.externalId);
    expect(otherAfter?.externalId).toBe(otherExtId);
    expect(row?.resolved).toBe(false);
  });

  it('resolves idempotently when the prior talent is already gone', async () => {
    const error = await makeError({
      existingExtId: `test_vanished_${stamp}`,
      attemptedExtId: `test_target_${stamp}`,
    });

    const result = await rebindTalentExtId(error.id);
    expect(result.ok).toBe(true);
    expect(
      (await prisma.syncError.findUnique({ where: { id: error.id } }))
        ?.resolved,
    ).toBe(true);
  });

  it('refuses a row that carries no extId to migrate', async () => {
    const error = await makeError({
      existingExtId: null,
      attemptedExtId: `test_orphan_${stamp}`,
    });
    expect(await rebindTalentExtId(error.id)).toEqual({
      ok: false,
      reason: 'no_existing_ext_id',
    });
  });

  it('reports a missing row rather than throwing', async () => {
    expect(await rebindTalentExtId('does_not_exist')).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('resolves one, a selected set (skipping already-resolved rows), and all', async () => {
    const [one, two, three] = await Promise.all([
      makeError({ attemptedExtId: `test_r1_${stamp}` }),
      makeError({ attemptedExtId: `test_r2_${stamp}` }),
      makeError({ attemptedExtId: `test_r3_${stamp}` }),
    ]);

    await resolveSyncError(one.id);
    expect(
      (await prisma.syncError.findUnique({ where: { id: one.id } }))?.resolved,
    ).toBe(true);

    // `one` is already resolved: scoped to `resolved: false`, so it is not
    // counted again and cannot be un-resolved by a stale id.
    const selected = await resolveSyncErrors([one.id, two.id]);
    expect(selected.count).toBe(1);

    const all = await resolveAllSyncErrors();
    expect(all.count).toBeGreaterThanOrEqual(1);
    expect(
      (await prisma.syncError.findUnique({ where: { id: three.id } }))
        ?.resolved,
    ).toBe(true);
  });
});
